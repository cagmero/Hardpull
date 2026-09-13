import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { keccak256, toHex, type Hex } from "viem";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireBearerAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { requireX402Payment } from "../lib/x402.js";
import { findValidConsent, consumeConsent } from "./consent.js";
import { hasSufficientStanding } from "../lib/standing.js";
import { invokeCreWorkflow } from "../lib/creClient.js";
import { getPublicExposure } from "../lib/subgraphClient.js";
import { attestVerdictOnChain } from "../chain/contracts.js";
import { submitInquiryLog } from "../lib/hcs.js";
import { dispatchWebhook } from "../lib/webhooks.js";

export const pull = new Hono();

const pullRequestSchema = z.object({
  subjectId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  proposedPrincipal: z.string(),
  currency: z.string(),
  consentToken: z.string(), // opaque handle the puller was given at consent-grant time
});

// Short-circuit order per docs/architecture.md #2.3: consent -> standing -> payment -> compute.
// Each gate returns before the next one runs, and none of them run compute, so a caller is
// never charged for a request that was always going to be rejected (docs/architecture.md #5).
const consentAndStandingGate: MiddlewareHandler = async (c, next) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
  const consentToken = typeof body.consentToken === "string" ? body.consentToken : "";
  const furnisherId = c.get("furnisherId") as Hex;

  // The token must name a live grant belonging to this exact (subject, puller) pair -- see
  // findValidConsent. A token for someone else's grant, an expired one, a revoked one, or an
  // exhausted one all land here identically, and none of them reach compute.
  const grant = await findValidConsent(subjectId, furnisherId, consentToken);
  if (!grant) {
    return c.json(
      {
        error: "CONSENT_MISSING",
        message: "No valid, unexpired, unexhausted consent grant matches this consentToken for this subject and puller",
      },
      403,
    );
  }
  c.set("consentGrantId", grant.id);

  if (!(await hasSufficientStanding(furnisherId))) {
    return c.json({ error: "RECIPROCITY_INSUFFICIENT", message: "Pull allowance exhausted for today" }, 402);
  }

  await next();
};

declare module "hono" {
  interface ContextVariableMap {
    consentGrantId: string;
  }
}

pull.use("/", requireBearerAuth, idempotency, consentAndStandingGate, requireX402Payment);

pull.post("/", async (c) => {
  const parsed = pullRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { subjectId, proposedPrincipal } = parsed.data;
  const furnisherId = c.get("furnisherId") as Hex;

  // 5. Gather inputs: this subject's furnished ciphertext set, public exposure, inquiry history.
  const records = await pool.query<{ record_id: string; furnisher_id: string; ciphertext: Buffer; commitment: string }>(
    `select distinct on (record_id) record_id, furnisher_id, ciphertext, commitment
     from position_ciphertexts where subject_id = $1 order by record_id, version desc`,
    [subjectId],
  );

  const wallets = await pool.query<{ wallet: string }>("select wallet from wallets where subject_id = $1", [subjectId]);
  const publicPositions = await getPublicExposure(wallets.rows.map((w) => w.wallet));

  const priorInquiries = await pool.query<{ puller_hash: string; occurred_at: Date }>(
    "select puller_hash, occurred_at from inquiries where subject_id = $1 order by occurred_at desc limit 200",
    [subjectId],
  );

  let signedVerdict;
  try {
    signedVerdict = await invokeCreWorkflow({
      subjectId,
      proposedPrincipal,
      encryptedRecords: records.rows.map((r) => ({
        furnisherId: r.furnisher_id,
        sealedBoxHex: toHex(r.ciphertext),
        commitmentHex: r.commitment,
      })),
      publicPositions,
      inquiries: priorInquiries.rows.map((i) => ({
        pullerHash: i.puller_hash,
        occurredAt: i.occurred_at.toISOString(),
      })),
    });
  } catch (err) {
    // architecture.md #5: "CRE workflow unavailable -> return 503, do not charge, queue retry,
    // never return a stale verdict." requireX402Payment's after-next() settlement hook checks
    // `c.res.status < 400` before calling processSettlement, so this 503 correctly skips
    // settlement -- the client's payment authorization is verified but never actually executed.
    // The one edge case this doesn't cover (and can't, without escrow): CRE succeeds and this
    // handler returns 200 with the verdict, but settlement itself then fails. The client keeps
    // the verdict, unpaid. That's the standard x402 "settle after fulfillment" trade-off -- it
    // fails toward giving away service, never toward charging without delivering it.
    return c.json({ error: "CRE_UNAVAILABLE", message: (err as Error).message }, 503);
  }

  const pullerHash = keccak256(toHex(`${furnisherId}-${subjectId}`));
  const inquiryIdHex = keccak256(toHex(`${subjectId}-${furnisherId}-${Date.now()}`));

  const inquiry = await pool.query<{ inquiry_id: string }>(
    `insert into inquiries (inquiry_id, subject_id, puller_id, puller_hash, verdict, exposure_bucket, stacking_flags, attestation)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) returning inquiry_id`,
    [
      subjectId,
      furnisherId,
      pullerHash,
      signedVerdict.verdict,
      signedVerdict.exposureBucket,
      signedVerdict.stackingFlags,
      signedVerdict.attestation,
    ],
  );

  // The gate already confirmed headroom, so this only returns false if the grant was revoked or
  // exhausted in the window between the two -- rare, but worth seeing rather than swallowing.
  const grantId = c.get("consentGrantId");
  if (!(await consumeConsent(grantId))) {
    console.warn(`consent grant ${grantId} could not be consumed (revoked or exhausted mid-request)`);
  }

  if (signedVerdict.verdict === "CRITICAL") {
    dispatchWebhook(furnisherId, "stacking.detected", {
      subjectId,
      stackingFlags: signedVerdict.stackingFlags,
      exposureBucket: signedVerdict.exposureBucket,
    });
  }

  // 6. Persist + attest onchain + log to HCS.
  //
  // The hash MUST be keccak256 of the exact bytes the enclave signed, which the workflow
  // publishes as canonicalPayload. Hashing a re-serialization of the response instead produces
  // a different digest, ecrecover returns a different address, and VerdictAttestations.attest()
  // reverts InvalidSignature() -- which is precisely what happened until this was fixed, and
  // went unnoticed because the write is best-effort and the pull still returned 200.
  if (signedVerdict.canonicalPayload) {
    const verdictHash = keccak256(`0x${signedVerdict.canonicalPayload.replace(/^0x/, "")}` as Hex);
    try {
      await attestVerdictOnChain(inquiryIdHex, verdictHash, signedVerdict.attestation as Hex);
    } catch (err) {
      // A failed attestation doesn't invalidate a verdict the puller already received and paid
      // for -- log and continue, matching architecture.md's "never return a stale verdict"
      // without retroactively un-answering a request that already succeeded.
      console.error("VerdictAttestations write failed", err);
    }
  } else {
    console.error(
      "CRE workflow returned no canonicalPayload; skipping the attestation write rather than " +
        "sending a hash that cannot verify. Upgrade the deployed workflow (cre/hardpull/wire.go).",
    );
  }

  try {
    await submitInquiryLog({
      inquiryId: inquiry.rows[0].inquiry_id,
      subjectIdHash: keccak256(subjectId as Hex),
      pullerHash,
      verdict: signedVerdict.verdict,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("HCS log submission failed", err);
  }

  // canonicalPayload is an internal detail of the attestation write; the documented response
  // shape (api/openapi.yaml) does not include it.
  const { canonicalPayload: _canonicalPayload, ...responseBody } = signedVerdict;
  return c.json(responseBody, 200);
});

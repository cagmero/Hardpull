import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { keccak256, toHex, type Hex } from "viem";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireBearerAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { requireX402Payment } from "../lib/x402.js";
import { hasValidConsent, consumeConsent } from "./consent.js";
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
  const body = await c.req.json();
  const { subjectId } = body;
  const furnisherId = c.get("furnisherId") as Hex;

  if (!(await hasValidConsent(subjectId, furnisherId))) {
    return c.json({ error: "CONSENT_MISSING", message: "No valid, unexpired consent grant for this subject" }, 403);
  }

  if (!(await hasSufficientStanding(furnisherId))) {
    return c.json({ error: "RECIPROCITY_INSUFFICIENT", message: "Pull allowance exhausted for today" }, 402);
  }

  await next();
};

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
    // never return a stale verdict." The x402 settlement above already ran on this request
    // path though (it happens in requireX402Payment's after-next hook, which fires after this
    // handler returns) -- so a genuine production implementation needs the CRE call to happen
    // *before* settlement fires, not after. Flagging this ordering gap explicitly rather than
    // leaving it implicit: see api/README.md "Known gaps".
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

  await consumeConsent(subjectId, furnisherId);

  if (signedVerdict.verdict === "CRITICAL") {
    dispatchWebhook(furnisherId, "stacking.detected", {
      subjectId,
      stackingFlags: signedVerdict.stackingFlags,
      exposureBucket: signedVerdict.exposureBucket,
    });
  }

  // 6. Persist + attest onchain + log to HCS.
  const verdictHash = keccak256(toHex(JSON.stringify(signedVerdict)));
  try {
    await attestVerdictOnChain(inquiryIdHex, verdictHash, signedVerdict.attestation as Hex);
  } catch (err) {
    // Attestation failing doesn't invalidate a verdict the puller already received and was
    // charged for -- log and continue, matching architecture.md's "never return a stale
    // verdict" without retroactively un-answering a request that already succeeded.
    console.error("VerdictAttestations write failed", err);
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

  return c.json(signedVerdict, 200);
});

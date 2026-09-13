import { Hono } from "hono";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { dispatchWebhook } from "../lib/webhooks.js";
import { buildConsentGrantMessage, buildConsentRevokeMessage } from "@hardpull/types";
import { verifySubjectSignature, SubjectAuthError } from "../lib/subjectAuth.js";
import { grantConsentRoleOnChain, revokeConsentRoleOnChain, isEacConfigured } from "../lib/ensEac.js";

export const consent = new Hono();

// spec.md #6.3 describes consent as an ENSv2 Enhanced Access Control grant. Postgres is the
// source of truth (fast reads, and the actual gate /v1/pull checks); the EAC write below is a
// best-effort onchain mirror, same pattern as subjects.ts/furnish.ts's other contract calls --
// except this one is a documented no-op until ENS_EAC_REGISTRY_ADDRESS is set AND a Hardpull
// subname has actually been minted for the subject (see lib/ensEac.ts for exactly why: EAC's
// grantRoles reverts unless the caller already admins the target resource, which only happens
// once something has been registered against it). Never let this block or fail the request --
// Postgres already recorded the grant by the time this runs.
//
// Auth here is the subject's wallet signature (see lib/subjectAuth.ts), NOT a furnisher bearer
// token -- granting consent is something the borrower does, not the lender.
const grantSchema = z.object({
  subjectId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  pullerId: z.string(),
  expiresAt: z.string().datetime(),
  maxPulls: z.number().int().positive(),
  purpose: z.string().optional(),
  timestamp: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

consent.post("/", async (c) => {
  const parsed = grantSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { subjectId, pullerId, expiresAt, maxPulls, purpose, timestamp, signature } = parsed.data;

  try {
    const message = buildConsentGrantMessage({ subjectId, pullerId, expiresAt, maxPulls, timestamp });
    await verifySubjectSignature(subjectId, message, signature as `0x${string}`, timestamp);
  } catch (err) {
    if (err instanceof SubjectAuthError) {
      return c.json({ error: "SUBJECT_AUTH_FAILED", message: err.message }, 401);
    }
    return c.json({ error: "SUBJECT_AUTH_FAILED", message: "Signature verification failed" }, 401);
  }

  const result = await pool.query<{ id: string }>(
    `insert into consent_grants (subject_id, puller_id, expires_at, max_pulls, purpose)
     values ($1, $2, $3, $4, $5) returning id`,
    [subjectId, pullerId, expiresAt, maxPulls, purpose ?? null],
  );

  let eacTxHash: string | undefined;
  if (isEacConfigured()) {
    try {
      const operator = await pool.query<{ operator_address: string }>(
        "select operator_address from furnishers where furnisher_id = $1",
        [pullerId],
      );
      const operatorAddress = operator.rows[0]?.operator_address;
      if (operatorAddress) {
        eacTxHash = await grantConsentRoleOnChain(subjectId as `0x${string}`, operatorAddress as `0x${string}`);
      }
    } catch (err) {
      console.error("ENSv2 EAC grantRoles failed (Postgres grant still stands)", err);
    }
  }

  dispatchWebhook(pullerId, "consent.granted", { subjectId, pullerId, expiresAt, maxPulls });

  return c.json({ grantId: result.rows[0].id, subjectId, pullerId, expiresAt, maxPulls, eacTxHash }, 201);
});

const revokeSchema = z.object({
  subjectId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  timestamp: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

consent.delete("/:grantId", async (c) => {
  const grantId = c.req.param("grantId");
  const parsed = revokeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { subjectId, timestamp, signature } = parsed.data;

  try {
    const message = buildConsentRevokeMessage({ grantId, timestamp });
    await verifySubjectSignature(subjectId, message, signature as `0x${string}`, timestamp);
  } catch (err) {
    if (err instanceof SubjectAuthError) {
      return c.json({ error: "SUBJECT_AUTH_FAILED", message: err.message }, 401);
    }
    return c.json({ error: "SUBJECT_AUTH_FAILED", message: "Signature verification failed" }, 401);
  }

  const result = await pool.query<{ id: string; subject_id: string; puller_id: string }>(
    "update consent_grants set revoked_at = now() where id = $1 and subject_id = $2 and revoked_at is null returning id, subject_id, puller_id",
    [grantId, subjectId],
  );
  const grant = result.rows[0];
  if (!grant) {
    return c.json({ error: "GRANT_NOT_FOUND", message: "No active grant with this id for this subject" }, 404);
  }

  if (isEacConfigured()) {
    try {
      const operator = await pool.query<{ operator_address: string }>(
        "select operator_address from furnishers where furnisher_id = $1",
        [grant.puller_id],
      );
      const operatorAddress = operator.rows[0]?.operator_address;
      if (operatorAddress) {
        await revokeConsentRoleOnChain(grant.subject_id as `0x${string}`, operatorAddress as `0x${string}`);
      }
    } catch (err) {
      console.error("ENSv2 EAC revokeRoles failed (Postgres revocation still stands)", err);
    }
  }

  dispatchWebhook(grant.puller_id, "consent.revoked", { subjectId: grant.subject_id, pullerId: grant.puller_id });

  return c.json({ grantId, revoked: true });
});

// Used by /v1/pull's short-circuit chain (docs/architecture.md #2.3 step 2) -- exported rather
// than duplicated so the consent check pull.ts runs is exactly this one.
export async function hasValidConsent(subjectId: string, pullerId: string): Promise<boolean> {
  const result = await pool.query<{ pulls_used: number; max_pulls: number }>(
    `select pulls_used, max_pulls from consent_grants
     where subject_id = $1 and puller_id = $2 and revoked_at is null and expires_at > now()
     order by created_at desc limit 1`,
    [subjectId, pullerId],
  );
  const grant = result.rows[0];
  return !!grant && grant.pulls_used < grant.max_pulls;
}

export async function consumeConsent(subjectId: string, pullerId: string): Promise<void> {
  await pool.query(
    `update consent_grants set pulls_used = pulls_used + 1
     where id = (
       select id from consent_grants
       where subject_id = $1 and puller_id = $2 and revoked_at is null and expires_at > now()
       order by created_at desc limit 1
     )`,
    [subjectId, pullerId],
  );
}

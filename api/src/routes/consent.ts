import { Hono } from "hono";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireBearerAuth } from "../middleware/auth.js";
import { dispatchWebhook } from "../lib/webhooks.js";

export const consent = new Hono();

// spec.md #6.3 describes consent as an ENSv2 Enhanced Access Control grant. That integration
// (T-071) is built separately against the real ENSv2 contracts and is out of scope for this
// route file -- EAC's exact interface wasn't something we could verify against real deployed
// contracts the way SubjectRegistry/FurnisherRegistry were. Postgres is the source of truth for
// v1; T-071 adds an onchain mirror write alongside this once that integration lands, the same
// pattern subjects.ts and furnish.ts already use for their contracts.
const grantSchema = z.object({
  subjectId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  pullerId: z.string(),
  expiresAt: z.string().datetime(),
  maxPulls: z.number().int().positive(),
  purpose: z.string().optional(),
});

consent.post("/", requireBearerAuth, async (c) => {
  const parsed = grantSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { subjectId, pullerId, expiresAt, maxPulls, purpose } = parsed.data;

  const result = await pool.query<{ id: string }>(
    `insert into consent_grants (subject_id, puller_id, expires_at, max_pulls, purpose)
     values ($1, $2, $3, $4, $5) returning id`,
    [subjectId, pullerId, expiresAt, maxPulls, purpose ?? null],
  );

  dispatchWebhook(pullerId, "consent.granted", { subjectId, pullerId, expiresAt, maxPulls });

  return c.json({ grantId: result.rows[0].id, subjectId, pullerId, expiresAt, maxPulls }, 201);
});

consent.delete("/:grantId", requireBearerAuth, async (c) => {
  const grantId = c.req.param("grantId");
  const result = await pool.query<{ id: string; subject_id: string; puller_id: string }>(
    "update consent_grants set revoked_at = now() where id = $1 and revoked_at is null returning id, subject_id, puller_id",
    [grantId],
  );
  const grant = result.rows[0];
  if (!grant) {
    return c.json({ error: "GRANT_NOT_FOUND", message: "No active grant with this id" }, 404);
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

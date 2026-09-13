import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Integration test against a real local Postgres (docker run postgres, migrations applied --
// see api/README.md). Skipped automatically if DATABASE_URL isn't exported, so `pnpm test`
// still passes in CI without the local dev stack running.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("consent (integration)", () => {
  let pool: import("pg").Pool;
  let findValidConsent: typeof import("../consent.js").findValidConsent;
  let consumeConsent: typeof import("../consent.js").consumeConsent;

  const subjectId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);
  const otherSubjectId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);
  const pullerId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);
  const otherPullerId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);

  async function createGrant(
    overrides: { subject?: string; puller?: string; expiresAt?: string; maxPulls?: number } = {},
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `insert into consent_grants (subject_id, puller_id, expires_at, max_pulls)
       values ($1, $2, ${overrides.expiresAt ?? "now() + interval '1 day'"}, $3) returning id`,
      [overrides.subject ?? subjectId, overrides.puller ?? pullerId, overrides.maxPulls ?? 2],
    );
    return result.rows[0].id;
  }

  beforeAll(async () => {
    ({ pool } = await import("../../db/pool.js"));
    ({ findValidConsent, consumeConsent } = await import("../consent.js"));
    for (const id of [subjectId, otherSubjectId]) {
      await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now())", [id]);
    }
    for (const id of [pullerId, otherPullerId]) {
      await pool.query(
        "insert into furnishers (furnisher_id, public_key_hex, operator_address) values ($1, 'x', $2)",
        [id, id.slice(0, 42)],
      );
    }
  });

  afterAll(async () => {
    for (const id of [subjectId, otherSubjectId]) {
      await pool.query("delete from consent_grants where subject_id = $1", [id]);
      await pool.query("delete from subjects where subject_id = $1", [id]);
    }
    for (const id of [pullerId, otherPullerId]) {
      await pool.query("delete from furnishers where furnisher_id = $1", [id]);
    }
    await pool.end();
  });

  it("rejects a token that is not a uuid, without touching the database", async () => {
    // A non-uuid would raise a type error inside Postgres rather than simply not matching, so
    // this guard runs before the query. "agent"/"mcp"/"demo" were real callers' placeholders.
    expect(await findValidConsent(subjectId, pullerId, "agent")).toBeNull();
    expect(await findValidConsent(subjectId, pullerId, "")).toBeNull();
  });

  it("rejects a well-formed token that names no grant", async () => {
    expect(await findValidConsent(subjectId, pullerId, randomUUID())).toBeNull();
  });

  it("accepts the token returned when the grant was created", async () => {
    const grantId = await createGrant();
    const grant = await findValidConsent(subjectId, pullerId, grantId);
    expect(grant?.id).toBe(grantId);
    expect(grant?.maxPulls).toBe(2);
  });

  it("refuses a grant belonging to a different puller", async () => {
    const grantId = await createGrant({ puller: otherPullerId });
    // The token is real and live -- it just isn't this lender's to present.
    expect(await findValidConsent(subjectId, otherPullerId, grantId)).not.toBeNull();
    expect(await findValidConsent(subjectId, pullerId, grantId)).toBeNull();
  });

  it("refuses a grant belonging to a different subject", async () => {
    const grantId = await createGrant({ subject: otherSubjectId });
    expect(await findValidConsent(subjectId, pullerId, grantId)).toBeNull();
  });

  it("becomes invalid once max_pulls is exhausted", async () => {
    const grantId = await createGrant({ maxPulls: 2 });

    expect(await consumeConsent(grantId)).toBe(true);
    expect(await findValidConsent(subjectId, pullerId, grantId)).not.toBeNull(); // 1 of 2 used

    expect(await consumeConsent(grantId)).toBe(true);
    expect(await findValidConsent(subjectId, pullerId, grantId)).toBeNull(); // 2 of 2 used

    // A third attempt changes nothing -- the update is conditional on headroom remaining.
    expect(await consumeConsent(grantId)).toBe(false);
  });

  it("is invalid after expiry", async () => {
    const grantId = await createGrant({ expiresAt: "now() - interval '1 hour'" });
    expect(await findValidConsent(subjectId, pullerId, grantId)).toBeNull();
  });

  it("is invalid after revocation", async () => {
    const grantId = await createGrant();
    await pool.query("update consent_grants set revoked_at = now() where id = $1", [grantId]);
    expect(await findValidConsent(subjectId, pullerId, grantId)).toBeNull();
    expect(await consumeConsent(grantId)).toBe(false);
  });
});

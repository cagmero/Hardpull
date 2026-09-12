import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Integration test against a real local Postgres (docker run postgres, migrations applied --
// see api/README.md). Skipped automatically if DATABASE_URL isn't exported, so `pnpm test`
// still passes in CI without the local dev stack running.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("consent (integration)", () => {
  let pool: import("pg").Pool;
  let hasValidConsent: typeof import("../consent.js").hasValidConsent;
  let consumeConsent: typeof import("../consent.js").consumeConsent;

  const subjectId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);
  const pullerId = `0x${randomUUID().replace(/-/g, "")}${"0".repeat(32)}`.slice(0, 66);

  beforeAll(async () => {
    ({ pool } = await import("../../db/pool.js"));
    ({ hasValidConsent, consumeConsent } = await import("../consent.js"));
    await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now())", [subjectId]);
    await pool.query(
      "insert into furnishers (furnisher_id, public_key_hex, operator_address) values ($1, 'x', 'y')",
      [pullerId],
    );
  });

  afterAll(async () => {
    await pool.query("delete from consent_grants where subject_id = $1", [subjectId]);
    await pool.query("delete from subjects where subject_id = $1", [subjectId]);
    await pool.query("delete from furnishers where furnisher_id = $1", [pullerId]);
    await pool.end();
  });

  it("has no valid consent before any grant exists", async () => {
    expect(await hasValidConsent(subjectId, pullerId)).toBe(false);
  });

  it("has valid consent after a grant is created", async () => {
    await pool.query(
      "insert into consent_grants (subject_id, puller_id, expires_at, max_pulls) values ($1, $2, now() + interval '1 day', 2)",
      [subjectId, pullerId],
    );
    expect(await hasValidConsent(subjectId, pullerId)).toBe(true);
  });

  it("becomes invalid once max_pulls is exhausted", async () => {
    await consumeConsent(subjectId, pullerId);
    expect(await hasValidConsent(subjectId, pullerId)).toBe(true); // 1 of 2 used
    await consumeConsent(subjectId, pullerId);
    expect(await hasValidConsent(subjectId, pullerId)).toBe(false); // 2 of 2 used
  });

  it("is invalid after expiry", async () => {
    await pool.query(
      `insert into consent_grants (subject_id, puller_id, expires_at, max_pulls)
       values ($1, $2, now() - interval '1 hour', 5)`,
      [subjectId, pullerId],
    );
    // most recent grant (by created_at) is the expired one -- still invalid overall since the
    // most-recent-grant lookup in hasValidConsent picks this one.
    expect(await hasValidConsent(subjectId, pullerId)).toBe(false);
  });
});

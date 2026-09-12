import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("subjectAuth (integration)", () => {
  let pool: import("pg").Pool;
  let buildConsentGrantMessage: typeof import("../subjectAuth.js").buildConsentGrantMessage;
  let verifySubjectSignature: typeof import("../subjectAuth.js").verifySubjectSignature;
  let SubjectAuthError: typeof import("../subjectAuth.js").SubjectAuthError;

  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const subjectId = "0xsubjectauthtest000000000000000000000000000000000000000000test";

  beforeAll(async () => {
    ({ pool } = await import("../../db/pool.js"));
    ({ buildConsentGrantMessage, verifySubjectSignature, SubjectAuthError } = await import("../subjectAuth.js"));
    await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now())", [subjectId]);
    await pool.query("insert into wallets (wallet, subject_id) values ($1, $2)", [account.address.toLowerCase(), subjectId]);
  });

  afterAll(async () => {
    await pool.query("delete from wallets where subject_id = $1", [subjectId]);
    await pool.query("delete from subjects where subject_id = $1", [subjectId]);
    await pool.end();
  });

  it("accepts a valid signature from the subject's bound wallet", async () => {
    const timestamp = Date.now();
    const message = buildConsentGrantMessage({ subjectId, pullerId: "0xpuller", expiresAt: "2027-01-01T00:00:00Z", maxPulls: 3, timestamp });
    const signature = await account.signMessage({ message });

    await expect(verifySubjectSignature(subjectId, message, signature, timestamp)).resolves.not.toThrow();
  });

  it("rejects a signature from a wallet not bound to this subject", async () => {
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    const timestamp = Date.now();
    const message = buildConsentGrantMessage({ subjectId, pullerId: "0xpuller", expiresAt: "2027-01-01T00:00:00Z", maxPulls: 3, timestamp });
    const signature = await otherAccount.signMessage({ message });

    await expect(verifySubjectSignature(subjectId, message, signature, timestamp)).rejects.toThrow(SubjectAuthError);
  });

  it("rejects a stale timestamp outside the clock-skew window", async () => {
    const timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const message = buildConsentGrantMessage({ subjectId, pullerId: "0xpuller", expiresAt: "2027-01-01T00:00:00Z", maxPulls: 3, timestamp });
    const signature = await account.signMessage({ message });

    await expect(verifySubjectSignature(subjectId, message, signature, timestamp)).rejects.toThrow(SubjectAuthError);
  });

  it("rejects a tampered message (signature no longer matches)", async () => {
    const timestamp = Date.now();
    const message = buildConsentGrantMessage({ subjectId, pullerId: "0xpuller", expiresAt: "2027-01-01T00:00:00Z", maxPulls: 3, timestamp });
    const signature = await account.signMessage({ message });
    const tamperedMessage = message.replace("maxPulls: 3", "maxPulls: 300");

    await expect(verifySubjectSignature(subjectId, tamperedMessage, signature, timestamp)).rejects.toThrow(SubjectAuthError);
  });
});

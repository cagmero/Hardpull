import { Hono } from "hono";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { verifyWorldIdProof } from "../lib/worldid.js";
import { registerSubjectOnChain } from "../chain/contracts.js";

export const subjects = new Hono();

const bindSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  proof: z.object({
    merkle_root: z.string(),
    nullifier_hash: z.string(),
    proof: z.string(),
    verification_level: z.enum(["orb", "device"]),
  }),
});

// POST /v1/subjects -- World ID binding (docs/spec.md #6.1, docs/plan.md T-053).
subjects.post("/", async (c) => {
  const parsed = bindSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { wallet, proof } = parsed.data;

  const verification = await verifyWorldIdProof(proof, wallet);
  if (!verification.success) {
    return c.json({ error: "INVALID_PROOF", message: verification.error }, 400);
  }

  const existing = await pool.query("select subject_id from subjects s join wallets w on w.subject_id = s.subject_id where w.wallet = $1", [
    wallet.toLowerCase(),
  ]);
  if (existing.rowCount) {
    return c.json({ error: "WALLET_ALREADY_BOUND", message: "This wallet is already bound to a subject" }, 409);
  }

  let subjectId: string;
  let txHash: string;
  try {
    const result = await registerSubjectOnChain(
      verification.nullifierHash as `0x${string}`,
      wallet as `0x${string}`,
    );
    subjectId = result.subjectId;
    txHash = result.txHash;
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("DuplicateNullifier") || message.includes("WalletAlreadyBound")) {
      return c.json({ error: "ALREADY_REGISTERED", message: "This nullifier or wallet is already registered" }, 409);
    }
    return c.json({ error: "CHAIN_UNAVAILABLE", message: `SubjectRegistry write failed: ${message}` }, 503);
  }

  await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now()) on conflict do nothing", [subjectId]);
  await pool.query("insert into wallets (wallet, subject_id) values ($1, $2)", [wallet.toLowerCase(), subjectId]);

  return c.json({ subjectId, wallet, txHash }, 201);
});

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { keccak256, type Hex } from "viem";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { writeCommitmentOnChain } from "../chain/contracts.js";
import { requireBearerAuth } from "../middleware/auth.js";
import { requireHmacSignature } from "../middleware/hmac.js";
import { idempotency } from "../middleware/idempotency.js";
import { dispatchWebhook } from "../lib/webhooks.js";

export const furnish = new Hono();
// HMAC layered over the bearer token (docs/context.md #2): a stolen bearer alone can't forge a
// furnish write without also knowing the furnisher's HMAC secret.
furnish.use("*", requireBearerAuth, requireHmacSignature, idempotency);

const furnishSchema = z.object({
  subjectId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  sealedBoxHex: z.string().regex(/^(0x)?[a-fA-F0-9]+$/),
});

function toHex(buf: Buffer): Hex {
  return `0x${buf.toString("hex")}`;
}

// POST /v1/furnish -- stores ciphertext, writes commitment onchain (docs/spec.md #6.2,
// docs/plan.md T-054). The API never decrypts; it only computes keccak256(ciphertext).
function parseBody(c: { get(key: "rawBody"): string | undefined }): unknown {
  const raw = c.get("rawBody");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

furnish.post("/", async (c) => {
  const parsed = furnishSchema.safeParse(parseBody(c));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { subjectId, sealedBoxHex } = parsed.data;
  const furnisherId = c.get("furnisherId") as Hex;

  const hex = sealedBoxHex.startsWith("0x") ? sealedBoxHex.slice(2) : sealedBoxHex;
  const ciphertext = Buffer.from(hex, "hex");
  const commitment = keccak256(toHex(ciphertext));
  const recordId = toHex(randomBytes(32));

  let version: bigint;
  let txHash: string;
  try {
    const result = await writeCommitmentOnChain(subjectId as Hex, furnisherId, recordId, commitment);
    version = result.version;
    txHash = result.txHash;
  } catch (err) {
    return c.json({ error: "CHAIN_UNAVAILABLE", message: `ExposureCommitments write failed: ${(err as Error).message}` }, 503);
  }

  await pool.query(
    `insert into position_ciphertexts (record_id, subject_id, furnisher_id, ciphertext, commitment, version, status, tx_hash)
     values ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)`,
    [recordId, subjectId, furnisherId, ciphertext, commitment, Number(version), txHash],
  );

  return c.json({ recordId, subjectId, commitment, version: Number(version), txHash }, 201);
});

const statusUpdateSchema = z.object({
  status: z.enum(["REPAID", "DEFAULTED", "CLOSED"]),
  sealedBoxHex: z.string().regex(/^(0x)?[a-fA-F0-9]+$/),
});

// DELETE /v1/furnish/{recordId} -- status transitions, each a new versioned record
// (docs/plan.md T-055). Prior versions are retained onchain and in Postgres, never overwritten.
furnish.delete("/:recordId", async (c) => {
  const recordId = c.req.param("recordId");
  const parsed = statusUpdateSchema.safeParse(parseBody(c));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { status, sealedBoxHex } = parsed.data;
  const furnisherId = c.get("furnisherId") as Hex;

  const existing = await pool.query<{ subject_id: string; version: number }>(
    "select subject_id, version from position_ciphertexts where record_id = $1 and furnisher_id = $2 order by version desc limit 1",
    [recordId, furnisherId],
  );
  const prior = existing.rows[0];
  if (!prior) {
    return c.json({ error: "RECORD_NOT_FOUND", message: "No record with this id for the authenticated furnisher" }, 404);
  }

  const hex = sealedBoxHex.startsWith("0x") ? sealedBoxHex.slice(2) : sealedBoxHex;
  const ciphertext = Buffer.from(hex, "hex");
  const commitment = keccak256(toHex(ciphertext));

  let version: bigint;
  let txHash: string;
  try {
    const result = await writeCommitmentOnChain(prior.subject_id as Hex, furnisherId, recordId as Hex, commitment);
    version = result.version;
    txHash = result.txHash;
  } catch (err) {
    return c.json({ error: "CHAIN_UNAVAILABLE", message: `ExposureCommitments write failed: ${(err as Error).message}` }, 503);
  }

  await pool.query(
    `insert into position_ciphertexts (record_id, subject_id, furnisher_id, ciphertext, commitment, version, status, tx_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [recordId, prior.subject_id, furnisherId, ciphertext, commitment, Number(version), status, txHash],
  );

  if (status === "DEFAULTED") {
    dispatchWebhook(furnisherId, "subject.default_reported", { subjectId: prior.subject_id, recordId });
  }

  return c.json({ recordId, status, version: Number(version), txHash }, 200);
});

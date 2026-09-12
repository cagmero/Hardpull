import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { keccak256, toBytes, namehash, type Address } from "viem";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { generateClientCredentials, hashClientSecret } from "../lib/credentials.js";
import { getWalletClient } from "../chain/clients.js";
import { deployments } from "../chain/clients.js";
import FurnisherRegistryAbi from "../chain/abis/FurnisherRegistry.json" with { type: "json" };

export const furnishers = new Hono();

const registerSchema = z.object({
  operatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  ensSubname: z.string().optional(), // e.g. "lender-a.hardpull.eth"
  publicKeyHex: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, "expected a 32-byte X25519 public key"),
});

// spec.md #6.2 step 1: "Furnisher registers, receives client_id/client_secret, and is recorded
// in FurnisherRegistry." Not in plan.md's explicit endpoint list but required for the flow it
// describes -- see api/README.md.
furnishers.post("/", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { operatorAddress, ensSubname, publicKeyHex } = parsed.data;

  const furnisherId = keccak256(toBytes(`${operatorAddress.toLowerCase()}-${randomUUID()}`));
  const publicKey = (publicKeyHex.startsWith("0x") ? publicKeyHex : `0x${publicKeyHex}`) as `0x${string}`;
  const ensNode = ensSubname ? namehash(ensSubname) : ("0x" + "0".repeat(64)) as `0x${string}`;

  let txHash: string;
  try {
    const wallet = getWalletClient();
    const { FurnisherRegistry } = deployments();
    txHash = await wallet.writeContract({
      address: FurnisherRegistry,
      abi: FurnisherRegistryAbi,
      functionName: "register",
      args: [furnisherId, ensNode, publicKey],
      account: wallet.account!,
    });
  } catch (err) {
    return c.json(
      { error: "CHAIN_UNAVAILABLE", message: `FurnisherRegistry write failed: ${(err as Error).message}` },
      503,
    );
  }

  const { clientId, clientSecret, hmacSecret } = generateClientCredentials();
  await pool.query(
    `insert into furnishers (furnisher_id, ens_name, public_key_hex, operator_address, client_id, client_secret_hash, hmac_secret)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [furnisherId, ensSubname ?? null, publicKey, operatorAddress, clientId, hashClientSecret(clientSecret), hmacSecret],
  );

  // client_secret and hmac_secret are returned exactly once -- neither is retrievable again.
  return c.json(
    { furnisherId, clientId, clientSecret, hmacSecret, ensNode, txHash },
    201,
  );
});

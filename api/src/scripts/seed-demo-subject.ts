import { randomBytes } from "node:crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { pool } from "../db/pool.js";
import { registerSubjectOnChain } from "../chain/contracts.js";

// Creates a demo subject without a World ID proof, for local rehearsal and the demo narrative.
//
// This is NOT an API bypass: POST /v1/subjects still requires a real World ID proof and there is
// no code path around it. This script talks to SubjectRegistry and Postgres directly, as the
// registrar, producing exactly the state a completed World ID verification would have produced --
// a nullifier-derived subjectId with one bound wallet. It is a dev tool, and it needs the
// registrar key, so it can only be run by whoever already controls that key.
//
//   pnpm --filter @hardpull/api exec tsx src/scripts/seed-demo-subject.ts
//
// Prints the subjectId and the subject's wallet private key -- the borrower needs that key to
// sign consent grants (spec.md #6.3). Testnet/demo keys only.

async function main() {
  const subjectKey = generatePrivateKey();
  const subjectAccount = privateKeyToAccount(subjectKey);
  const nullifierHash = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

  const { subjectId, txHash } = await registerSubjectOnChain(nullifierHash, subjectAccount.address);

  await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now()) on conflict do nothing", [
    subjectId,
  ]);
  await pool.query("insert into wallets (wallet, subject_id) values ($1, $2) on conflict do nothing", [
    subjectAccount.address.toLowerCase(),
    subjectId,
  ]);

  console.log(JSON.stringify({ subjectId, wallet: subjectAccount.address, subjectPrivateKey: subjectKey, txHash }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});

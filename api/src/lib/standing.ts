import { pool } from "../db/pool.js";
import { pullAllowanceOnChain } from "../chain/contracts.js";

// spec.md #6.7: pullAllowance = BASE_ALLOWANCE + freshFurnishedRecords * K, read live from
// ReciprocityLedger (never the subgraph mirror, which is a best-effort cache -- see
// subgraph/README.md). Standing is checked against pulls already made today.
export async function hasSufficientStanding(furnisherId: `0x${string}`): Promise<boolean> {
  const allowance = await pullAllowanceOnChain(furnisherId);

  const result = await pool.query<{ count: string }>(
    "select count(*) from inquiries where puller_id = $1 and occurred_at > now() - interval '1 day'",
    [furnisherId],
  );
  const pullsToday = BigInt(result.rows[0]?.count ?? "0");

  return pullsToday < allowance;
}

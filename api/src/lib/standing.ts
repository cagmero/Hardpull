import { pool } from "../db/pool.js";
import { pullAllowanceOnChain, freshRecordCountOnChain } from "../chain/contracts.js";
import { dispatchWebhook } from "./webhooks.js";

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

// spec.md #6.8 lists `standing.changed` among the webhook events, and #6.7 defines standing as
// a function of fresh furnished records -- so the moment that changes is exactly a furnish
// write. Fire-and-forget, like every other dispatch: a furnisher's 201 must not wait on two
// contract reads and a webhook enqueue, and a failure here must never fail the write that
// already succeeded onchain.
export function notifyStandingChanged(furnisherId: `0x${string}`, reason: string): void {
  Promise.all([pullAllowanceOnChain(furnisherId), freshRecordCountOnChain(furnisherId)])
    .then(([pullAllowance, freshRecordCount]) => {
      dispatchWebhook(furnisherId, "standing.changed", {
        furnisherId,
        pullAllowance: pullAllowance.toString(),
        freshRecordCount: freshRecordCount.toString(),
        reason,
      });
    })
    .catch((err) => console.error("standing.changed lookup failed; webhook not sent", err));
}

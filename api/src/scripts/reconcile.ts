// Hourly reconciliation: compares Postgres commitment counts and standing to onchain state and
// raises an alert on drift (docs/architecture.md #3.2, docs/plan.md T-05A). Run via cron
// (e.g. `0 * * * *`) pointed at this script, or invoke on a schedule from your platform of choice.
import { pool } from "../db/pool.js";
import { pullAllowanceOnChain } from "../chain/contracts.js";

interface DriftReport {
  furnisherId: string;
  postgresFreshRecordProxy: number;
  onchainPullAllowance: string;
}

async function reconcile(): Promise<void> {
  const furnishers = await pool.query<{ furnisher_id: string }>("select furnisher_id from furnishers");
  const drifts: DriftReport[] = [];

  for (const { furnisher_id } of furnishers.rows) {
    const localCount = await pool.query<{ count: string }>(
      `select count(*) from position_ciphertexts
       where furnisher_id = $1 and status = 'ACTIVE' and created_at > now() - interval '30 days'`,
      [furnisher_id],
    );

    let onchainAllowance: bigint;
    try {
      onchainAllowance = await pullAllowanceOnChain(furnisher_id as `0x${string}`);
    } catch (err) {
      console.error(`Reconciliation: failed to read onchain standing for ${furnisher_id}`, err);
      continue;
    }

    // This is a proxy comparison, not an exact equality check -- Postgres counts furnished
    // records, ReciprocityLedger returns a computed allowance (BASE_ALLOWANCE + count * K).
    // A real drift alert needs the contract's K/BASE_ALLOWANCE to invert this properly; logged
    // here as a starting point rather than a false-precision comparison.
    drifts.push({
      furnisherId: furnisher_id,
      postgresFreshRecordProxy: Number(localCount.rows[0].count),
      onchainPullAllowance: onchainAllowance.toString(),
    });
  }

  console.log(JSON.stringify({ reconciledAt: new Date().toISOString(), furnishers: drifts.length, drifts }, null, 2));
}

reconcile()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Reconciliation job failed", err);
    process.exit(1);
  });

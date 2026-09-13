// Hourly reconciliation: compares Postgres commitment counts and standing to onchain state and
// raises an alert on drift (docs/architecture.md #3.2, docs/plan.md T-05A). Run via cron
// (e.g. `0 * * * *`) pointed at this script, or invoke on a schedule from your platform of choice.
// Exit code is non-zero when drift is found, so a cron wrapper can alert on failure without
// parsing output.
import { pool } from "../db/pool.js";
import { freshRecordCountOnChain, freshWindowSecondsOnChain, versionCountOnChain } from "../chain/contracts.js";

interface StandingDrift {
  furnisherId: string;
  postgresFreshRecordCount: number;
  onchainFreshRecordCount: string;
}

interface CommitmentDrift {
  recordId: string;
  subjectId: string;
  furnisherId: string;
  postgresVersionCount: number;
  onchainVersionCount: string;
}

async function reconcileStanding(): Promise<StandingDrift[]> {
  const freshWindowSeconds = await freshWindowSecondsOnChain();
  const furnishers = await pool.query<{ furnisher_id: string }>("select furnisher_id from furnishers");
  const drifts: StandingDrift[] = [];

  for (const { furnisher_id } of furnishers.rows) {
    // Mirrors ReciprocityLedger.freshRecordCount(): count distinct record_ids whose most recent
    // version was written within the contract's own freshWindow, read live rather than assumed.
    const localCount = await pool.query<{ count: string }>(
      `select count(distinct record_id) from position_ciphertexts
       where furnisher_id = $1 and created_at > now() - ($2 || ' seconds')::interval`,
      [furnisher_id, freshWindowSeconds.toString()],
    );

    let onchainCount: bigint;
    try {
      onchainCount = await freshRecordCountOnChain(furnisher_id as `0x${string}`);
    } catch (err) {
      console.error(`Reconciliation: failed to read onchain standing for ${furnisher_id}`, err);
      continue;
    }

    const postgresCount = Number(localCount.rows[0].count);
    if (BigInt(postgresCount) !== onchainCount) {
      drifts.push({ furnisherId: furnisher_id, postgresFreshRecordCount: postgresCount, onchainFreshRecordCount: onchainCount.toString() });
    }
  }

  return drifts;
}

async function reconcileCommitmentVersions(): Promise<CommitmentDrift[]> {
  const records = await pool.query<{ record_id: string; subject_id: string; furnisher_id: string; version_count: string }>(
    `select record_id, subject_id, furnisher_id, count(*) as version_count
     from position_ciphertexts
     group by record_id, subject_id, furnisher_id`,
  );
  const drifts: CommitmentDrift[] = [];

  for (const row of records.rows) {
    let onchainVersionCount: bigint;
    try {
      onchainVersionCount = await versionCountOnChain(
        row.subject_id as `0x${string}`,
        row.furnisher_id as `0x${string}`,
        row.record_id as `0x${string}`,
      );
    } catch (err) {
      console.error(`Reconciliation: failed to read onchain version count for ${row.record_id}`, err);
      continue;
    }

    const postgresVersionCount = Number(row.version_count);
    if (BigInt(postgresVersionCount) !== onchainVersionCount) {
      drifts.push({
        recordId: row.record_id,
        subjectId: row.subject_id,
        furnisherId: row.furnisher_id,
        postgresVersionCount,
        onchainVersionCount: onchainVersionCount.toString(),
      });
    }
  }

  return drifts;
}

async function reconcile(): Promise<void> {
  const [standingDrifts, commitmentDrifts] = await Promise.all([reconcileStanding(), reconcileCommitmentVersions()]);

  const report = {
    reconciledAt: new Date().toISOString(),
    standingDrifts,
    commitmentDrifts,
    clean: standingDrifts.length === 0 && commitmentDrifts.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!report.clean) {
    process.exitCode = 1;
  }
}

reconcile()
  .catch((err) => {
    console.error("Reconciliation job failed", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

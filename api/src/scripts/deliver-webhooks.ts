// Delivers pending webhook_deliveries rows, retrying on a schedule spanning ~24h
// (docs/spec.md #6.8, docs/plan.md T-059). Run this on a short interval (e.g. every minute) via
// cron or your platform's scheduler -- each run picks up whatever is currently due and exits;
// it is not a long-running daemon, the same pattern as src/scripts/reconcile.ts.
import { pool } from "../db/pool.js";
import { signWebhookBody, RETRY_DELAYS_SECONDS } from "../lib/webhooks.js";

interface DueDelivery {
  id: string;
  event: string;
  payload: unknown;
  attempt_count: number;
  url: string;
  secret: string;
}

async function fetchDue(): Promise<DueDelivery[]> {
  const result = await pool.query<DueDelivery>(
    `select d.id, d.event, d.payload, d.attempt_count, s.url, s.secret
     from webhook_deliveries d
     join webhook_subscriptions s on s.id = d.subscription_id
     where d.status = 'PENDING' and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit 100`,
  );
  return result.rows;
}

async function attemptDelivery(delivery: DueDelivery): Promise<boolean> {
  const body = JSON.stringify({ event: delivery.event, data: delivery.payload });
  const signature = signWebhookBody(body, delivery.secret);

  try {
    const res = await fetch(delivery.url, {
      method: "POST",
      headers: { "content-type": "application/json", "hardpull-signature": signature },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function processDelivery(delivery: DueDelivery): Promise<void> {
  const success = await attemptDelivery(delivery);

  if (success) {
    await pool.query("update webhook_deliveries set status = 'DELIVERED', delivered_at = now() where id = $1", [delivery.id]);
    return;
  }

  const nextAttemptCount = delivery.attempt_count + 1;
  if (nextAttemptCount >= RETRY_DELAYS_SECONDS.length) {
    await pool.query(
      "update webhook_deliveries set status = 'FAILED', attempt_count = $2, last_error = 'retries exhausted' where id = $1",
      [delivery.id, nextAttemptCount],
    );
    return;
  }

  const delaySeconds = RETRY_DELAYS_SECONDS[nextAttemptCount];
  await pool.query(
    `update webhook_deliveries
     set attempt_count = $2, next_attempt_at = now() + ($3 || ' seconds')::interval, last_error = 'delivery failed'
     where id = $1`,
    [delivery.id, nextAttemptCount, delaySeconds.toString()],
  );
}

async function main(): Promise<void> {
  const due = await fetchDue();
  await Promise.all(due.map(processDelivery));
  console.log(JSON.stringify({ processedAt: new Date().toISOString(), count: due.length }));
}

main()
  .catch((err) => {
    console.error("Webhook delivery worker failed", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

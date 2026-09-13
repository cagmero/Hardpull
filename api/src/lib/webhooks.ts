import { pool } from "../db/pool.js";
import { signBody } from "./hmac.js";

export type WebhookEvent =
  | "stacking.detected"
  | "consent.granted"
  | "consent.revoked"
  | "subject.default_reported"
  | "standing.changed";

// Retry schedule spans ~24h (spec.md #6.8), enforced by the worker in
// src/scripts/deliver-webhooks.ts rather than an in-process setTimeout chain -- that couldn't
// survive a process restart and only ever spanned about an hour. Run the worker on a schedule
// (e.g. every minute) the same way src/scripts/reconcile.ts is run hourly.
export const RETRY_DELAYS_SECONDS = [0, 60, 5 * 60, 30 * 60, 2 * 60 * 60, 6 * 60 * 60, 24 * 60 * 60];

// Enqueues a delivery row per active subscription matching this event (docs/spec.md #6.8,
// docs/plan.md T-059). Fire-and-forget from the caller's perspective: the actual HTTP delivery
// happens in the worker, not here, so a slow or unreachable webhook endpoint never blocks the
// request that triggered it.
export function dispatchWebhook(furnisherId: string, event: WebhookEvent, payload: object): void {
  pool
    .query<{ id: string }>(
      "select id from webhook_subscriptions where furnisher_id = $1 and active and $2 = any(events)",
      [furnisherId, event],
    )
    .then((result) => {
      if (result.rows.length === 0) return;
      const values = result.rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      const params = result.rows.flatMap((row) => [row.id, event, JSON.stringify(payload)]);
      return pool.query(`insert into webhook_deliveries (subscription_id, event, payload) values ${values}`, params);
    })
    .catch((err) => console.error("Failed to enqueue webhook delivery", err));
}

export function signWebhookBody(body: string, secret: string): string {
  return signBody(body, secret);
}

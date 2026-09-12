import { pool } from "../db/pool.js";
import { signBody } from "./hmac.js";

export type WebhookEvent =
  | "stacking.detected"
  | "consent.granted"
  | "consent.revoked"
  | "subject.default_reported"
  | "standing.changed";

interface Subscription {
  id: string;
  url: string;
  secret: string;
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 5 * 60_000, 60 * 60_000]; // ~1h total, not the
// full 24h spec.md #6.8 calls for -- a durable retry queue (persisted job + cron worker) is
// needed for that and is out of scope for this pass. See api/README.md "Known gaps".

async function deliverOnce(subscription: Subscription, event: WebhookEvent, payload: object): Promise<boolean> {
  const body = JSON.stringify({ event, data: payload });
  const signature = signBody(body, subscription.secret);

  try {
    const res = await fetch(subscription.url, {
      method: "POST",
      headers: { "content-type": "application/json", "hardpull-signature": signature },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deliverWithRetry(subscription: Subscription, event: WebhookEvent, payload: object): Promise<void> {
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (await deliverOnce(subscription, event, payload)) return;
  }
  console.error(`Webhook delivery exhausted retries: ${event} -> ${subscription.url}`);
}

// Fires event to every active subscription for a furnisher that's subscribed to it
// (docs/spec.md #6.8, docs/plan.md T-059). Fire-and-forget: callers don't await delivery.
export function dispatchWebhook(furnisherId: string, event: WebhookEvent, payload: object): void {
  pool
    .query<Subscription>(
      "select id, url, secret from webhook_subscriptions where furnisher_id = $1 and active and $2 = any(events)",
      [furnisherId, event],
    )
    .then((result) => {
      for (const subscription of result.rows) {
        void deliverWithRetry(subscription, event, payload);
      }
    })
    .catch((err) => console.error("Failed to look up webhook subscriptions", err));
}

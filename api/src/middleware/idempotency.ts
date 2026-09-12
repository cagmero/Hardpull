import type { MiddlewareHandler } from "hono";
import { redis } from "../redis.js";
import { pool } from "../db/pool.js";

declare module "hono" {
  interface ContextVariableMap {
    idempotencyKey: string | undefined;
  }
}

const TTL_SECONDS = 24 * 60 * 60;

interface CachedResponse {
  status: number;
  body: unknown;
}

function redisKey(furnisherId: string, key: string): string {
  return `idempotency:${furnisherId}:${key}`;
}

// Idempotency-Key header -> Redis cache of (key -> response), 24h TTL (docs/context.md #2,
// docs/plan.md T-052). A repeated request with the same key returns the cached response and
// performs no side effects -- the route handler is never invoked on a cache hit.
export const idempotency: MiddlewareHandler = async (c, next) => {
  const key = c.req.header("idempotency-key");
  if (!key) {
    return c.json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required" }, 400);
  }

  const furnisherId = c.get("furnisherId") ?? "anonymous";
  const cacheKey = redisKey(furnisherId, key);

  const cached = await redis.get(cacheKey);
  if (cached) {
    const { status, body } = JSON.parse(cached) as CachedResponse;
    c.header("x-idempotency-replayed", "true");
    return c.json(body as object, status as never);
  }

  c.set("idempotencyKey", cacheKey);
  await next();

  // Cache whatever the handler produced, so a retry short-circuits before any side effects.
  if (c.res && c.res.status < 500) {
    const bodyText = await c.res.clone().text();
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
    const payload: CachedResponse = { status: c.res.status, body };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", TTL_SECONDS);
    await pool.query(
      `insert into idempotency_keys (key, response_status, response_body, expires_at)
       values ($1, $2, $3, now() + interval '24 hours')
       on conflict (key) do nothing`,
      [cacheKey, c.res.status, JSON.stringify(body)],
    );
  }
};

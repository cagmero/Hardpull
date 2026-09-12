import type { MiddlewareHandler } from "hono";
import { redis } from "../redis.js";

// Coarse abuse-prevention limiter, distinct from the reciprocity-based pull allowance enforced
// inside the /v1/pull handler (docs/architecture.md #2.3 step 3, spec.md #6.7). This just caps
// raw request volume per caller regardless of endpoint.
export function rateLimit(maxRequests: number, windowSeconds: number): MiddlewareHandler {
  return async (c, next) => {
    const identity = c.get("furnisherId") ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const key = `ratelimit:${identity}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > maxRequests) {
      return c.json({ error: "RATE_LIMITED", message: "Too many requests" }, 429);
    }

    await next();
  };
}

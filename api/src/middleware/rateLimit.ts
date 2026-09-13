import type { MiddlewareHandler } from "hono";
import { redis } from "../redis.js";

// Coarse abuse-prevention limiter, distinct from the reciprocity-based pull allowance enforced
// inside the /v1/pull handler (docs/architecture.md #2.3 step 3, spec.md #6.7). This just caps
// raw request volume per caller regardless of endpoint.

const REDIS_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("redis timed out")), REDIS_TIMEOUT_MS)),
  ]);
}

export function rateLimit(maxRequests: number, windowSeconds: number): MiddlewareHandler {
  return async (c, next) => {
    // Health checks must never consume the limiter, and must never depend on it. A load
    // balancer polling /health should not be able to rate-limit itself out of service, and
    // /health/ready exists precisely to report that a dependency like Redis is down -- it
    // cannot do that from behind a middleware that needs Redis to be up.
    if (c.req.path === "/health" || c.req.path.startsWith("/health/")) {
      return next();
    }

    const identity = c.get("furnisherId") ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const key = `ratelimit:${identity}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    let count: number;
    try {
      count = await withTimeout(redis.incr(key));
      if (count === 1) {
        await withTimeout(redis.expire(key, windowSeconds));
      }
    } catch (err) {
      // Fail OPEN, loudly. ioredis queues commands and retries rather than rejecting when the
      // server is unreachable, so without this an unreachable Redis turns every request into a
      // hang and then a 500 -- the whole API down because a coarse abuse limiter is unavailable.
      // Losing rate limiting during a Redis outage is the lesser failure, and the alternative
      // was discovered by actually stopping Redis: /health/ready returned 500 after 11s.
      console.error("rate limit check failed; allowing the request", (err as Error).message);
      return next();
    }

    if (count > maxRequests) {
      return c.json({ error: "RATE_LIMITED", message: "Too many requests" }, 429);
    }

    await next();
  };
}

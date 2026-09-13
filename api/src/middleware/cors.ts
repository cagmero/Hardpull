import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

// The console and Lender A call this API directly from the browser, on a different origin
// (3000/3002 in development, separate Vercel deployments in production). Without CORS the
// request still reaches the server and still succeeds -- it is the *response* the browser
// discards, so the API log shows a clean 200 while the UI hangs on a loading state forever.
// That is exactly how this was found.
//
// HARDPULL_ALLOWED_ORIGINS is a comma-separated allowlist. It defaults to the local dev ports
// only, so production has to name its origins explicitly rather than inheriting a wildcard.
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3002", "http://localhost:3003"];

export function allowedOrigins(): string[] {
  const configured = process.env.HARDPULL_ALLOWED_ORIGINS;
  if (!configured?.trim()) return DEV_ORIGINS;
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const corsMiddleware: MiddlewareHandler = cors({
  origin: (origin) => (allowedOrigins().includes(origin) ? origin : null),
  // Every custom header a browser client actually sends. Idempotency-Key and
  // Hardpull-Signature are not CORS-safelisted, so omitting them fails the preflight.
  allowHeaders: [
    "content-type",
    "authorization",
    "idempotency-key",
    "hardpull-signature",
    "x-payment",
  ],
  // x-idempotency-replayed tells a client its request was a replay; it is useless if the
  // browser cannot read it.
  exposeHeaders: ["x-request-id", "x-idempotency-replayed", "x-hardpull-x402-bypassed"],
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  maxAge: 86400,
});

import type { MiddlewareHandler } from "hono";
import { pool } from "../db/pool.js";
import { verifySignature } from "../lib/hmac.js";

declare module "hono" {
  interface ContextVariableMap {
    rawBody: string;
  }
}

// Verifies Hardpull-Signature over the raw request body, using the furnisher's HMAC secret.
// Runs after requireBearerAuth so c.get("furnisherId") is already populated.
export const requireHmacSignature: MiddlewareHandler = async (c, next) => {
  const signature = c.req.header("hardpull-signature");
  if (!signature) {
    return c.json({ error: "SIGNATURE_MISSING", message: "Hardpull-Signature header is required" }, 401);
  }

  const rawBody = await c.req.text();
  const furnisherId = c.get("furnisherId");

  const result = await pool.query<{ hmac_secret: string | null }>(
    "select hmac_secret from furnishers where furnisher_id = $1",
    [furnisherId],
  );
  const hmacSecret = result.rows[0]?.hmac_secret;
  if (!hmacSecret || !verifySignature(rawBody, hmacSecret, signature)) {
    return c.json({ error: "SIGNATURE_INVALID", message: "Hardpull-Signature verification failed" }, 401);
  }

  // Re-attach the body so downstream handlers (which call c.req.json()) can still read it --
  // consuming the stream via c.req.text() above would otherwise leave nothing for them.
  c.set("rawBody", rawBody);
  await next();
};

import type { MiddlewareHandler } from "hono";
import { verifyAccessToken } from "../lib/jwt.js";

declare module "hono" {
  interface ContextVariableMap {
    furnisherId: string;
    clientId: string;
    requestId: string;
  }
}

// OAuth2 client-credentials bearer check (docs/context.md #2 "carries over as knowledge").
export const requireBearerAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "UNAUTHORIZED", message: "Missing bearer token" }, 401);
  }

  try {
    const payload = await verifyAccessToken(header.slice("Bearer ".length));
    c.set("furnisherId", payload.furnisherId);
    c.set("clientId", payload.clientId);
  } catch {
    return c.json({ error: "UNAUTHORIZED", message: "Invalid or expired token" }, 401);
  }

  await next();
};

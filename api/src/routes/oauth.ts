import { Hono } from "hono";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { verifyClientSecret } from "../lib/credentials.js";
import { issueAccessToken } from "../lib/jwt.js";

export const oauth = new Hono();

const tokenRequestSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string(),
  client_secret: z.string(),
});

// OAuth2 client-credentials token endpoint. Furnishers exchange the client_id/client_secret
// issued at registration (T-054's /v1/furnishers) for a short-lived bearer token.
oauth.post("/token", async (c) => {
  const parsed = tokenRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_request", message: parsed.error.message }, 400);
  }

  const { client_id, client_secret } = parsed.data;
  const result = await pool.query<{ furnisher_id: string; client_secret_hash: string | null }>(
    "select furnisher_id, client_secret_hash from furnishers where client_id = $1",
    [client_id],
  );
  const row = result.rows[0];
  if (!row?.client_secret_hash || !verifyClientSecret(client_secret, row.client_secret_hash)) {
    return c.json({ error: "invalid_client", message: "Unknown client_id or invalid client_secret" }, 401);
  }

  const { token, expiresIn } = await issueAccessToken(row.furnisher_id, client_id);
  return c.json({ access_token: token, token_type: "Bearer", expires_in: expiresIn });
});

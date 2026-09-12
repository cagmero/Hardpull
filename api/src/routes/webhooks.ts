import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireBearerAuth } from "../middleware/auth.js";

export const webhooks = new Hono();
webhooks.use("*", requireBearerAuth);

const subscribeSchema = z.object({
  url: z.string().url(),
  events: z
    .array(z.enum(["stacking.detected", "consent.granted", "consent.revoked", "subject.default_reported", "standing.changed"]))
    .min(1),
});

webhooks.post("/", async (c) => {
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
  }
  const { url, events } = parsed.data;
  const furnisherId = c.get("furnisherId");
  const secret = randomBytes(32).toString("hex");

  const result = await pool.query<{ id: string }>(
    "insert into webhook_subscriptions (furnisher_id, url, events, secret) values ($1, $2, $3, $4) returning id",
    [furnisherId, url, events, secret],
  );

  return c.json({ id: result.rows[0].id, url, events, secret }, 201);
});

webhooks.delete("/:id", async (c) => {
  const furnisherId = c.get("furnisherId");
  const result = await pool.query(
    "update webhook_subscriptions set active = false where id = $1 and furnisher_id = $2 returning id",
    [c.req.param("id"), furnisherId],
  );
  if (!result.rowCount) {
    return c.json({ error: "SUBSCRIPTION_NOT_FOUND", message: "No subscription with this id for this furnisher" }, 404);
  }
  return c.json({ id: c.req.param("id"), active: false });
});

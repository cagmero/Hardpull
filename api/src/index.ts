import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// Route modules land here as workstreams complete:
// subjects (T-053), furnish (T-054/055), consent (T-056), pull (T-057),
// inquiries (T-058), webhooks (T-059). See ../docs/plan.md WS-5.

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`hardpull-api listening on :${port}`);

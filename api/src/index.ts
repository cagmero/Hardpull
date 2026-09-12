import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { requestId } from "./middleware/requestId.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { oauth } from "./routes/oauth.js";
import { furnishers } from "./routes/furnishers.js";
import { subjects } from "./routes/subjects.js";
import { furnish } from "./routes/furnish.js";
import { consent } from "./routes/consent.js";
import { pull } from "./routes/pull.js";
import { inquiries } from "./routes/inquiries.js";
import { webhooks } from "./routes/webhooks.js";

const app = new Hono();

app.use("*", requestId);
app.use("*", rateLimit(120, 60));

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/oauth", oauth);
app.route("/v1/furnishers", furnishers);
app.route("/v1/subjects", subjects);
app.route("/v1/furnish", furnish);
app.route("/v1/consent", consent);
app.route("/v1/pull", pull);
app.route("/v1/webhooks", webhooks);
app.route("/v1", inquiries); // /v1/subjects/:id/inquiries, /v1/pull/:inquiryId

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`hardpull-api listening on :${port}`);

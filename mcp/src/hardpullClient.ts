import { HardpullClient } from "@hardpull/sdk-node";

const API_URL = process.env.HARDPULL_API_URL ?? "http://localhost:3001";

let cachedToken: { token: string; expiresAt: number } | undefined;

// The MCP server is itself a puller identity (spec.md #4.4's "underwriting agent" pattern,
// generalized to any MCP client): it needs its own Hardpull client_id/client_secret, issued the
// same way any lender's is (POST /v1/furnishers), to call authenticated endpoints.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const clientId = process.env.HARDPULL_CLIENT_ID;
  const clientSecret = process.env.HARDPULL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HARDPULL_CLIENT_ID/HARDPULL_CLIENT_SECRET not set");

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`oauth token request failed: ${res.status}`);

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cachedToken.token;
}

export async function getRecentInquiries(subjectId: string, days: number): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}/v1/subjects/${subjectId}/inquiries`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`inquiry lookup failed: ${res.status}`);

  const body = (await res.json()) as { inquiries: { occurred_at: string }[] };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return body.inquiries.filter((i) => new Date(i.occurred_at).getTime() >= cutoff);
}

export async function checkStackingRisk(subjectId: string, proposedPrincipal: string): Promise<unknown> {
  const token = await getAccessToken();
  const client = new HardpullClient(API_URL, token);
  return client.pull({ subjectId, proposedPrincipal, currency: "USD", consentToken: "mcp" });
}

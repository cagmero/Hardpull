import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateKeyPair, toHex } from "@hardpull/types";
import { getCredentials, setCredentials } from "@/lib/agentState";

const API_URL = process.env.HARDPULL_API_URL ?? "http://localhost:3001";

// The autonomous underwriting agent (docs/spec.md #4.4, docs/plan.md T-063): receives a loan
// application, pays for and calls /v1/pull with no human credential-provisioning step, and
// returns an approve/decline decision. Runs server-side so it never exposes its own client
// credentials to the browser.
async function ensureRegistered(trace: string[]) {
  let creds = getCredentials();
  if (creds) return creds;

  trace.push("Registering underwriting agent as a Hardpull furnisher/puller identity...");
  const operatorAddress = `0x${randomBytes(20).toString("hex")}`;
  // This agent's OWN X25519 identity key for FurnisherRegistry. It is not the CRE workflow key
  // (which records are sealed to) -- this agent only pulls, so it never seals anything.
  const identityKey = generateKeyPair();
  const res = await fetch(`${API_URL}/v1/furnishers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operatorAddress, publicKeyHex: toHex(identityKey.publicKey) }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`agent registration failed: ${JSON.stringify(body)}`);

  creds = body;
  setCredentials(creds!);
  trace.push(`Agent identity: ${creds!.furnisherId}`);
  return creds!;
}

export async function POST(req: Request) {
  const trace: string[] = [];
  try {
    const { subjectId, proposedPrincipal, consentToken } = await req.json();
    const creds = await ensureRegistered(trace);

    trace.push("Requesting access token...");
    const tokenRes = await fetch(`${API_URL}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
    }).then((r) => r.json());

    trace.push(`Calling POST /v1/pull for subject ${subjectId} (proposed principal ${proposedPrincipal})...`);
    const pullRequestBody = JSON.stringify({ subjectId, proposedPrincipal, currency: "USD", consentToken });
    const pullRes = await fetch(`${API_URL}/v1/pull`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenRes.access_token}`,
        "idempotency-key": randomUUID(),
      },
      body: pullRequestBody,
    });
    const pullBody = await pullRes.json();

    if (pullRes.status === 402) {
      trace.push("Received x402 payment challenge. This environment has no funded Hedera testnet account to settle it -- see demo-lenders/lender-b/README.md.");
      return NextResponse.json({ decision: "UNABLE_TO_DECIDE", reason: "x402 payment required, not settled in this environment", trace, challenge: pullBody });
    }
    if (pullRes.status === 403) {
      trace.push(
        `Consent missing -- correct behavior, not a bug. The borrower must grant THIS agent's identity ` +
          `(${creds.furnisherId}) a consent grant in the Hardpull console, then hand over the grantId ` +
          `it returns as the consentToken.`,
      );
      return NextResponse.json({ decision: "UNABLE_TO_DECIDE", reason: "CONSENT_MISSING", trace });
    }
    if (pullRes.status !== 200) {
      trace.push(`Pull failed: ${JSON.stringify(pullBody)}`);
      return NextResponse.json({ decision: "UNABLE_TO_DECIDE", reason: pullBody.error ?? "unknown error", trace }, { status: 502 });
    }

    trace.push(`Verdict: ${pullBody.verdict} (exposure bucket ${pullBody.exposureBucket}, flags: ${JSON.stringify(pullBody.stackingFlags)})`);
    trace.push("Note what is absent from this response: no furnisher identity, no exact amount, no counterparty -- disclosure limits enforced by the CRE enclave (docs/spec.md #6.6).");

    const decision = pullBody.verdict === "CLEAR" ? "APPROVE" : pullBody.verdict === "INSUFFICIENT_DATA" ? "APPROVE_WITH_REVIEW" : "DECLINE";
    trace.push(`Decision: ${decision}`);

    return NextResponse.json({ decision, verdict: pullBody, trace });
  } catch (err) {
    trace.push(`Error: ${(err as Error).message}`);
    return NextResponse.json({ decision: "UNABLE_TO_DECIDE", reason: (err as Error).message, trace }, { status: 500 });
  }
}

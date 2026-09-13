import type { Verdict } from "@hardpull/types";
import { buildJsonRpcRequest, createCreJwt, stableStringify, type WorkflowSelector } from "./creJwt.js";

export interface CreEncryptedRecord {
  furnisherId: string;
  sealedBoxHex: string;
  commitmentHex: string;
}

export interface CrePublicPosition {
  sourceId: string;
  principal: string;
  status: string;
  originatedAt: string;
  statusChangedAt?: string;
}

export interface CreInquiry {
  pullerHash: string;
  occurredAt: string;
}

export interface CrePullRequest {
  subjectId: string;
  proposedPrincipal: string;
  encryptedRecords: CreEncryptedRecord[];
  publicPositions: CrePublicPosition[];
  inquiries: CreInquiry[];
}

export interface SignedVerdict extends Verdict {
  attestation: string;
  /**
   * Hex of the exact bytes `attestation` signs (the workflow's canonical verdict JSON).
   * VerdictAttestations.sol verifies ecrecover over keccak256 of these bytes, so the API must
   * hash what the enclave actually signed rather than re-serializing the response itself --
   * doing the latter is why every attest() call used to revert InvalidSignature().
   */
  canonicalPayload?: string;
}

function workflowSelector(): WorkflowSelector {
  const workflowId = process.env.CRE_WORKFLOW_ID;
  if (workflowId) return { workflowID: workflowId };

  const workflowOwner = process.env.CRE_WORKFLOW_OWNER;
  const workflowName = process.env.CRE_WORKFLOW_NAME;
  const workflowTag = process.env.CRE_WORKFLOW_TAG;
  if (workflowOwner && workflowName && workflowTag) {
    return { workflowOwner, workflowName, workflowTag };
  }

  throw new Error("Set CRE_WORKFLOW_ID, or CRE_WORKFLOW_OWNER/CRE_WORKFLOW_NAME/CRE_WORKFLOW_TAG");
}

// Invokes the deployed CRE confidential workflow via the CRE gateway's JSON-RPC interface
// (docs/architecture.md #2.2, cre/main.go onPullRequest). Request signing (src/lib/creJwt.ts)
// is a verified port of the real CRE TypeScript SDK's client -- not guessed. Unverified against
// a live gateway: there's no deployed workflow yet to sign against and confirm the server
// accepts (see cre/README.md and docs/DECISIONS.md for what CRE-side verification is pending).
export async function invokeCreWorkflow(request: CrePullRequest): Promise<SignedVerdict> {
  const gatewayUrl = process.env.CRE_GATEWAY_URL;
  const privateKey = process.env.CRE_CALLER_PRIVATE_KEY;
  if (!gatewayUrl) throw new Error("CRE_GATEWAY_URL is not set");
  if (!privateKey) throw new Error("CRE_CALLER_PRIVATE_KEY is not set");

  const jsonRpcRequest = buildJsonRpcRequest(workflowSelector(), request);
  const jwt = await createCreJwt(jsonRpcRequest, privateKey as `0x${string}`);

  const res = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
    body: stableStringify(jsonRpcRequest),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRE gateway returned ${res.status}: ${text}`);
  }

  // The fetched reference client (trigger-workflow.ts) returns the parsed body directly without
  // unwrapping a `.result` field, so the exact response envelope isn't confirmed -- handle both
  // a bare verdict body and a JSON-RPC-style {result} / {error} wrapper rather than assume one.
  const body = (await res.json()) as Record<string, unknown>;
  if (body.error) throw new Error(`CRE workflow error: ${(body.error as { message: string }).message}`);

  const payload = (body.result ?? body) as Record<string, unknown>;
  return normalizeVerdict(payload);
}

// Running `cre workflow simulate` against cre/hardpull showed the CRE runtime serializes a
// handler's return value using Go FIELD NAMES and ignores its `json` tags entirely: the verdict
// comes back as {"Verdict": "CRITICAL", "ExposureBucket": "50k-250k", ...}, not the camelCase
// this API and its OpenAPI schema use. Rather than guess which casing a live gateway settles
// on, accept either -- the cost is one lookup per field, and the alternative is a verdict that
// silently reads as undefined and turns every pull into a false INSUFFICIENT_DATA.
function normalizeVerdict(payload: Record<string, unknown>): SignedVerdict {
  const pick = <T>(camel: string, fallback: T): T => {
    const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
    const value = payload[camel] ?? payload[pascal];
    return (value === undefined ? fallback : value) as T;
  };

  const verdict = pick<SignedVerdict["verdict"] | undefined>("verdict", undefined);
  if (!verdict) {
    throw new Error(`CRE workflow returned no verdict field: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  return {
    verdict,
    exposureBucket: pick("exposureBucket", "" as SignedVerdict["exposureBucket"]),
    originationVelocity48h: pick("originationVelocity48h", 0),
    inquiryVelocity7d: pick("inquiryVelocity7d", 0),
    distinctFurnishers: pick("distinctFurnishers", 0),
    stackingFlags: pick<SignedVerdict["stackingFlags"]>("stackingFlags", []),
    computedAt: pick("computedAt", new Date().toISOString()),
    attestation: pick("attestation", ""),
    canonicalPayload: pick<string | undefined>("canonicalPayload", undefined),
  };
}

import { createHash, randomUUID } from "node:crypto";
import stringify from "json-stable-stringify";
import { parseSignature, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Ported line-for-line in structure from the real CRE TypeScript SDK
// (github.com/smartcontractkit/cre-sdk-typescript, packages/cre-http-trigger/src/create-jwt.ts
// and utils.ts, fetched and verified 2026-09-13) -- not guessed. CRE HTTP triggers authenticate
// callers via a JWT whose payload digest commits to the exact JSON-RPC request body, signed with
// a private key corresponding to one of the workflow's AuthorizedKeys
// (docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/triggering-deployed-workflows).

export type WorkflowSelector = { workflowID: string } | { workflowOwner: string; workflowName: string; workflowTag: string };

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: {
    input: unknown;
    workflow: WorkflowSelector;
  };
}

function sha256(data: unknown): string {
  const jsonString = typeof data === "string" ? data : (stringify(data) ?? "");
  return createHash("sha256").update(jsonString).digest("hex");
}

function base64UrlEncode(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function createCreJwt(request: JsonRpcRequest, privateKey: Hex): Promise<string> {
  const account = privateKeyToAccount(privateKey);

  const header = { alg: "ETH", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    digest: `0x${sha256(request)}`,
    iss: account.address,
    iat: now,
    exp: now + 300,
    jti: randomUUID(),
  };

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header), "utf8").toString("base64"));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8").toString("base64"));
  const rawMessage = `${encodedHeader}.${encodedPayload}`;

  const signature = await account.signMessage({ message: rawMessage });
  const { r, s, v, yParity } = parseSignature(signature);
  const recoveryId = v !== undefined ? (v >= 27n ? v - 27n : v) : yParity;
  if (recoveryId === undefined) throw new Error("Unable to extract recovery ID from signature");

  const rBuffer = Buffer.from(r.slice(2).padStart(64, "0"), "hex");
  const sBuffer = Buffer.from(s.slice(2).padStart(64, "0"), "hex");
  const signatureBytes = Buffer.concat([rBuffer, sBuffer, Buffer.from([Number(recoveryId)])]);
  const encodedSignature = base64UrlEncode(signatureBytes.toString("base64"));

  return `${rawMessage}.${encodedSignature}`;
}

export function buildJsonRpcRequest(workflow: WorkflowSelector, input: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "workflows.execute",
    params: { input, workflow },
  };
}

export { stringify as stableStringify };

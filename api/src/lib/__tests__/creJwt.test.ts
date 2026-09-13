import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { createCreJwt, buildJsonRpcRequest } from "../creJwt.js";

describe("creJwt", () => {
  it("produces a JWT whose signature recovers to the signing key's address", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const request = buildJsonRpcRequest({ workflowID: "test-workflow" }, { subjectId: "0xabc", proposedPrincipal: "1000" });
    const jwt = await createCreJwt(request, privateKey);

    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
    expect(encodedHeader).toBeTruthy();
    expect(encodedPayload).toBeTruthy();
    expect(encodedSignature).toBeTruthy();

    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "ETH", typ: "JWT" });

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    expect(payload.iss.toLowerCase()).toBe(account.address.toLowerCase());
    expect(payload.digest).toMatch(/^0x[a-f0-9]{64}$/);
    expect(payload.exp - payload.iat).toBe(300);

    // Reconstruct r/s/v from the base64url signature segment and re-derive the eth-style
    // signature to confirm it actually recovers to the signer -- not just well-formed.
    const sigBytes = Buffer.from(encodedSignature, "base64url");
    expect(sigBytes.length).toBe(65);
    const r = `0x${sigBytes.subarray(0, 32).toString("hex")}` as `0x${string}`;
    const s = `0x${sigBytes.subarray(32, 64).toString("hex")}` as `0x${string}`;
    const v = sigBytes[64];
    const ethSignature = `${r}${s.slice(2)}${(v + 27).toString(16).padStart(2, "0")}` as `0x${string}`;

    const rawMessage = `${encodedHeader}.${encodedPayload}`;
    const recovered = await recoverMessageAddress({ message: rawMessage, signature: ethSignature });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("digest changes if the request body changes", async () => {
    const privateKey = generatePrivateKey();
    const requestA = buildJsonRpcRequest({ workflowID: "wf" }, { subjectId: "0xabc" });
    const requestB = buildJsonRpcRequest({ workflowID: "wf" }, { subjectId: "0xdef" });

    const jwtA = await createCreJwt(requestA, privateKey);
    const jwtB = await createCreJwt(requestB, privateKey);

    const payloadA = JSON.parse(Buffer.from(jwtA.split(".")[1], "base64url").toString("utf8"));
    const payloadB = JSON.parse(Buffer.from(jwtB.split(".")[1], "base64url").toString("utf8"));
    expect(payloadA.digest).not.toBe(payloadB.digest);
  });
});

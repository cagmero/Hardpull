import { describe, it, expect } from "vitest";
import { signBody, verifySignature } from "../hmac.js";

describe("hmac", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ subjectId: "0xabc", sealedBoxHex: "deadbeef" });

  it("verifies a signature produced with the same secret", () => {
    const signature = signBody(body, secret);
    expect(verifySignature(body, secret, signature)).toBe(true);
  });

  it("rejects a signature from a different secret", () => {
    const signature = signBody(body, "other-secret");
    expect(verifySignature(body, secret, signature)).toBe(false);
  });

  it("rejects a signature for a tampered body", () => {
    const signature = signBody(body, secret);
    const tamperedBody = JSON.stringify({ subjectId: "0xabc", sealedBoxHex: "beefdead" });
    expect(verifySignature(tamperedBody, secret, signature)).toBe(false);
  });

  it("rejects malformed hex without throwing", () => {
    expect(verifySignature(body, secret, "not-hex-!!")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { generateClientCredentials, hashClientSecret, verifyClientSecret } from "../credentials.js";

describe("credentials", () => {
  it("generates distinct client id, secret, and hmac secret", () => {
    const a = generateClientCredentials();
    const b = generateClientCredentials();
    expect(a.clientId).not.toEqual(b.clientId);
    expect(a.clientSecret).not.toEqual(b.clientSecret);
    expect(a.hmacSecret).not.toEqual(b.hmacSecret);
    expect(a.clientId).toMatch(/^hp_[a-f0-9]{32}$/);
  });

  it("verifies a correct secret against its hash", () => {
    const { clientSecret } = generateClientCredentials();
    const hash = hashClientSecret(clientSecret);
    expect(verifyClientSecret(clientSecret, hash)).toBe(true);
  });

  it("rejects an incorrect secret", () => {
    const { clientSecret } = generateClientCredentials();
    const hash = hashClientSecret(clientSecret);
    expect(verifyClientSecret("wrong-secret", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    const { clientSecret } = generateClientCredentials();
    expect(hashClientSecret(clientSecret)).not.toEqual(hashClientSecret(clientSecret));
  });
});

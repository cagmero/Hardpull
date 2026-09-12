import { describe, it, expect, beforeAll } from "vitest";
import { issueAccessToken, verifyAccessToken } from "../jwt.js";

describe("jwt", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
  });

  it("issues a token that verifies back to the same furnisher and client", async () => {
    const { token, expiresIn } = await issueAccessToken("0xfurnisher", "hp_client1");
    expect(expiresIn).toBe(3600);

    const payload = await verifyAccessToken(token);
    expect(payload.furnisherId).toBe("0xfurnisher");
    expect(payload.clientId).toBe("hp_client1");
  });

  it("rejects a tampered token", async () => {
    const { token } = await issueAccessToken("0xfurnisher", "hp_client1");
    const tampered = token.slice(0, -2) + "xx";
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await issueAccessToken("0xfurnisher", "hp_client1");
    process.env.JWT_SECRET = "different-secret";
    await expect(verifyAccessToken(token)).rejects.toThrow();
    process.env.JWT_SECRET = "test-jwt-secret";
  });
});

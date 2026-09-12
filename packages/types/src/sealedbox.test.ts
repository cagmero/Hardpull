import { describe, it, expect } from "vitest";
import { generateKeyPair, sealAnonymous, openAnonymous, toHex, fromHex } from "./sealedbox.js";

describe("sealedbox", () => {
  it("round-trips a message", () => {
    const { publicKey, secretKey } = generateKeyPair();
    const message = new TextEncoder().encode(JSON.stringify({ subjectId: "0xabc", principal: "50000" }));

    const sealed = sealAnonymous(message, publicKey);
    const opened = openAnonymous(sealed, publicKey, secretKey);

    expect(new TextDecoder().decode(opened)).toEqual(new TextDecoder().decode(message));
  });

  it("fails to open with the wrong secret key", () => {
    const recipient = generateKeyPair();
    const wrongKey = generateKeyPair();
    const sealed = sealAnonymous(new TextEncoder().encode("secret"), recipient.publicKey);

    expect(() => openAnonymous(sealed, recipient.publicKey, wrongKey.secretKey)).toThrow();
  });

  it("fails to open a tampered ciphertext", () => {
    const { publicKey, secretKey } = generateKeyPair();
    const sealed = sealAnonymous(new TextEncoder().encode("secret"), publicKey);
    sealed[sealed.length - 1] ^= 0xff;

    expect(() => openAnonymous(sealed, publicKey, secretKey)).toThrow();
  });

  it("hex round-trips", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(toHex(fromHex("0x00ff"))).toEqual("00ff");
  });
});

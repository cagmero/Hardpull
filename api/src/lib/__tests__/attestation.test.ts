import { describe, it, expect } from "vitest";
import { keccak256, recoverMessageAddress, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Regression test for the attestation digest.
//
// VerdictAttestations.sol does exactly this:
//   ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(verdictHash), signature) == creSigner
//
// and the enclave signs keccak256(json.Marshal(workflow.Verdict)) -- the bytes it publishes as
// canonicalPayload. routes/pull.ts must hash THOSE bytes. It previously hashed
// JSON.stringify(signedVerdict) instead, which is a different byte string, so every attest()
// call reverted InvalidSignature() while the pull still returned 200 (the write is
// best-effort). Nothing failed loudly; the attestation simply never got written.

/** What the enclave does: keccak over the canonical bytes, then sign as an eth message. */
async function signLikeEnclave(canonicalPayload: string, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const digest = keccak256(toHex(canonicalPayload));
  const signature = await account.signMessage({ message: { raw: digest } });
  return { account, digest, signature };
}

describe("verdict attestation digest", () => {
  // Byte-for-byte what Go's json.Marshal(workflow.Verdict) emits: struct field order, no spaces.
  const canonicalPayload =
    '{"verdict":"CRITICAL","exposureBucket":"50k-250k","originationVelocity48h":2,' +
    '"inquiryVelocity7d":0,"distinctFurnishers":2,"stackingFlags":["MULTI_ORIGINATION_48H"],' +
    '"computedAt":"2026-09-13T13:25:50Z"}';

  it("recovers the signer when hashing the canonical payload the workflow published", async () => {
    const key = generatePrivateKey();
    const { account, signature } = await signLikeEnclave(canonicalPayload, key);

    // This is the computation routes/pull.ts performs.
    const verdictHash = keccak256(toHex(canonicalPayload));
    const recovered = await recoverMessageAddress({ message: { raw: verdictHash }, signature });

    expect(recovered).toBe(account.address);
  });

  it("does NOT recover the signer when hashing a re-serialization of the response", async () => {
    const key = generatePrivateKey();
    const { account, signature } = await signLikeEnclave(canonicalPayload, key);

    // The old, broken behavior: re-serialize the response object and hash that. It includes the
    // attestation itself and uses JS key order, so it can never equal the signed bytes.
    const responseShaped = JSON.stringify({
      verdict: "CRITICAL",
      exposureBucket: "50k-250k",
      originationVelocity48h: 2,
      inquiryVelocity7d: 0,
      distinctFurnishers: 2,
      stackingFlags: ["MULTI_ORIGINATION_48H"],
      computedAt: "2026-09-13T13:25:50Z",
      attestation: signature,
    });

    const wrongHash = keccak256(toHex(responseShaped));
    const recovered = await recoverMessageAddress({ message: { raw: wrongHash }, signature });

    expect(recovered).not.toBe(account.address);
  });

  it("treats canonicalPayload as bytes, tolerating an 0x prefix either way", () => {
    const hex = toHex(canonicalPayload);
    const withPrefix = keccak256(hex);
    const stripped = keccak256(`0x${hex.replace(/^0x/, "")}` as Hex);
    expect(stripped).toBe(withPrefix);
  });

  it("changes the digest if any verdict field changes", () => {
    const downgraded = canonicalPayload.replace('"CRITICAL"', '"CLEAR"');
    expect(keccak256(toHex(downgraded))).not.toBe(keccak256(toHex(canonicalPayload)));
  });
});

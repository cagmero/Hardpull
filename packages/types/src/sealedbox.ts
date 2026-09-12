import nacl from "tweetnacl";
import { blake2b } from "blakejs";

// TypeScript twin of cre/workflow/sealedbox.go -- must stay byte-for-byte compatible, since
// furnishers seal records here (browser or Node) and only the CRE enclave's Go implementation
// ever opens them. Verified interoperable in packages/types/src/sealedbox.test.ts and again
// cross-language in cre/workflow/sealedbox_test.go.

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

function sealedBoxNonce(ephemeralPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const combined = new Uint8Array(ephemeralPub.length + recipientPub.length);
  combined.set(ephemeralPub, 0);
  combined.set(recipientPub, ephemeralPub.length);
  return blake2b(combined, undefined, 24);
}

/** libsodium crypto_box_seal: ephemeral keypair per message, sender needs only the recipient's public key. */
export function sealAnonymous(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const ephemeral = nacl.box.keyPair();
  const nonce = sealedBoxNonce(ephemeral.publicKey, recipientPublicKey);
  const ciphertext = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);

  const sealed = new Uint8Array(ephemeral.publicKey.length + ciphertext.length);
  sealed.set(ephemeral.publicKey, 0);
  sealed.set(ciphertext, ephemeral.publicKey.length);
  return sealed;
}

/** Opens a crypto_box_seal ciphertext. Only ever needed here for tests -- production opening happens in the Go enclave. */
export function openAnonymous(sealed: Uint8Array, recipientPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array {
  const overhead = nacl.box.overheadLength;
  if (sealed.length < recipientPublicKey.length + overhead) {
    throw new Error("sealed box too short");
  }

  const ephemeralPub = sealed.slice(0, 32);
  const ciphertext = sealed.slice(32);
  const nonce = sealedBoxNonce(ephemeralPub, recipientPublicKey);

  const opened = nacl.box.open(ciphertext, nonce, ephemeralPub, recipientSecretKey);
  if (!opened) throw new Error("failed to open sealed box: authentication failed");
  return opened;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

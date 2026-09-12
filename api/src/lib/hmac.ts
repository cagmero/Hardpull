import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256 request signing layered over OAuth2 bearer auth (docs/context.md #2). Signs the
// raw request body so a stolen bearer token alone can't forge a write.
export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, secret: string, providedSignatureHex: string): boolean {
  const expected = Buffer.from(signBody(body, secret), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignatureHex, "hex");
  } catch {
    return false;
  }
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

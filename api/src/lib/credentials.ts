import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function generateClientCredentials(): { clientId: string; clientSecret: string; hmacSecret: string } {
  return {
    clientId: `hp_${randomUUID().replace(/-/g, "")}`,
    clientSecret: randomBytes(32).toString("hex"),
    hmacSecret: randomBytes(32).toString("hex"),
  };
}

export function hashClientSecret(secret: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyClientSecret(secret: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, salt, KEY_LENGTH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

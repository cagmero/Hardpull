import { SignJWT, jwtVerify } from "jose";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function issueAccessToken(furnisherId: string, clientId: string): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = 3600;
  const token = await new SignJWT({ clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(furnisherId)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey());
  return { token, expiresIn };
}

export interface AccessTokenPayload {
  furnisherId: string;
  clientId: string;
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub || typeof payload.clientId !== "string") {
    throw new Error("malformed token");
  }
  return { furnisherId: payload.sub, clientId: payload.clientId };
}

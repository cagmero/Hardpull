import { z } from "zod";
import { SubjectIdSchema } from "./subject.js";

// spec.md #6.3 -- ENSv2 Enhanced Access Control grant
export const ConsentGrantSchema = z.object({
  subjectId: SubjectIdSchema,
  pullerId: z.string(),
  expiresAt: z.string().datetime(),
  maxPulls: z.number().int().positive(),
  purpose: z.string(),
  revokedAt: z.string().datetime().nullable(),
});
export type ConsentGrant = z.infer<typeof ConsentGrantSchema>;

// Canonical message formats for subject-signed consent actions (spec.md #6.3 -- granting/
// revoking consent is a subject action, authenticated by a wallet signature, not a furnisher
// bearer token). Shared here so the API (which verifies) and any client (which signs) can never
// drift apart on the exact bytes being signed -- a byte-for-byte mismatch would make every
// signature fail to verify. See api/src/lib/subjectAuth.ts.
export function buildConsentGrantMessage(params: {
  subjectId: string;
  pullerId: string;
  expiresAt: string;
  maxPulls: number;
  timestamp: number;
}): string {
  return [
    "Hardpull consent grant",
    `subjectId: ${params.subjectId}`,
    `pullerId: ${params.pullerId}`,
    `expiresAt: ${params.expiresAt}`,
    `maxPulls: ${params.maxPulls}`,
    `timestamp: ${params.timestamp}`,
  ].join("\n");
}

export function buildConsentRevokeMessage(params: { grantId: string; timestamp: number }): string {
  return ["Hardpull consent revoke", `grantId: ${params.grantId}`, `timestamp: ${params.timestamp}`].join("\n");
}

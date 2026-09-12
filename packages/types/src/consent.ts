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

import { z } from "zod";
import { SubjectIdSchema } from "./subject.js";

export const PositionStatusSchema = z.enum(["ACTIVE", "REPAID", "DEFAULTED", "CLOSED"]);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

// spec.md #6.2 -- the record a furnisher encrypts to the CRE workflow public key
export const PositionRecordSchema = z.object({
  subjectId: SubjectIdSchema,
  principal: z.string(), // decimal string, wei-precision
  currency: z.string(),
  originatedAt: z.string().datetime(),
  maturityAt: z.string().datetime().nullable(),
  status: PositionStatusSchema,
  furnisherId: z.string(),
  nonce: z.string(),
});
export type PositionRecord = z.infer<typeof PositionRecordSchema>;

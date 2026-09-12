import { z } from "zod";

// subjectId = keccak256(worldIdNullifierHash ++ "hardpull.v1") — spec.md #4.1
export const SubjectIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export type SubjectId = z.infer<typeof SubjectIdSchema>;

export const SubjectSchema = z.object({
  subjectId: SubjectIdSchema,
  wallets: z.array(z.string()),
  firstSeenAt: z.string().datetime(),
});
export type Subject = z.infer<typeof SubjectSchema>;

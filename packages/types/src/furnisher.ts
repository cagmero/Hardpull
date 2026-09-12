import { z } from "zod";

// spec.md #6.7 -- reciprocity standing, mirrors ReciprocityLedger
export const FurnisherStandingSchema = z.object({
  furnisherId: z.string(),
  ensName: z.string().nullable(),
  freshRecordCount: z.number().int().nonnegative(),
  pullAllowance: z.number().int().nonnegative(),
  standingUpdatedAt: z.string().datetime(),
});
export type FurnisherStanding = z.infer<typeof FurnisherStandingSchema>;

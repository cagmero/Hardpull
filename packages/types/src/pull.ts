import { z } from "zod";
import { SubjectIdSchema } from "./subject.js";

// spec.md #6.4 -- POST /v1/pull request body
export const PullRequestSchema = z.object({
  subjectId: SubjectIdSchema,
  proposedPrincipal: z.string(),
  currency: z.string(),
  consentToken: z.string(),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export const VerdictLevelSchema = z.enum(["CLEAR", "WARNING", "CRITICAL", "INSUFFICIENT_DATA"]);
export type VerdictLevel = z.infer<typeof VerdictLevelSchema>;

export const ExposureBucketSchema = z.enum(["<10k", "10k-50k", "50k-250k", "250k-1M", ">1M"]);
export type ExposureBucket = z.infer<typeof ExposureBucketSchema>;

export const StackingFlagSchema = z.enum(["MULTI_ORIGINATION_48H", "INQUIRY_BURST", "DATA_INTEGRITY_WARNING"]);
export type StackingFlag = z.infer<typeof StackingFlagSchema>;

// spec.md #6.4 step 4 -- the only thing a puller ever receives.
// No furnisher identity, no exact amount, no counterparty, no prior puller. Enforced by
// cre/ at the type level (docs/plan.md T-042), mirrored here for API/SDK consumers.
export const VerdictSchema = z.object({
  verdict: VerdictLevelSchema,
  exposureBucket: ExposureBucketSchema,
  originationVelocity48h: z.number().int().nonnegative(),
  inquiryVelocity7d: z.number().int().nonnegative(),
  distinctFurnishers: z.number().int().nonnegative(),
  stackingFlags: z.array(StackingFlagSchema),
  computedAt: z.string().datetime(),
  attestation: z.string(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

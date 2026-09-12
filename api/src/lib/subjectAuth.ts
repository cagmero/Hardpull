import { recoverMessageAddress } from "viem";
import { pool } from "../db/pool.js";

export { buildConsentGrantMessage, buildConsentRevokeMessage } from "@hardpull/types";

// Consent is a subject (borrower) action, not a furnisher action (docs/spec.md #6.3: "Subject
// grants a puller time-boxed read access") -- it must never be gated by a furnisher's OAuth2
// bearer token. Subjects don't hold API client credentials at all; they authenticate by signing
// a message with a wallet already bound to their subjectId (checked against the `wallets`
// table SubjectRegistry backs). A five-minute timestamp window stands in for full nonce
// tracking -- a real deployment should track consumed (subjectId, timestamp) pairs to close the
// replay window entirely.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class SubjectAuthError extends Error {}

export async function verifySubjectSignature(
  subjectId: string,
  message: string,
  signature: `0x${string}`,
  timestamp: number,
): Promise<void> {
  if (Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
    throw new SubjectAuthError("Signature timestamp outside the allowed window");
  }

  const recovered = await recoverMessageAddress({ message, signature });

  const result = await pool.query(
    "select 1 from wallets where wallet = $1 and subject_id = $2",
    [recovered.toLowerCase(), subjectId],
  );
  if (!result.rowCount) {
    throw new SubjectAuthError("Recovered address is not a wallet bound to this subject");
  }
}

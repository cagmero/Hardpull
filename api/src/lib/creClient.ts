import type { Verdict } from "@hardpull/types";

export interface CreEncryptedRecord {
  furnisherId: string;
  sealedBoxHex: string;
  commitmentHex: string;
}

export interface CrePublicPosition {
  sourceId: string;
  principal: string;
  status: string;
  originatedAt: string;
  statusChangedAt?: string;
}

export interface CreInquiry {
  pullerHash: string;
  occurredAt: string;
}

export interface CrePullRequest {
  subjectId: string;
  proposedPrincipal: string;
  encryptedRecords: CreEncryptedRecord[];
  publicPositions: CrePublicPosition[];
  inquiries: CreInquiry[];
}

export interface SignedVerdict extends Verdict {
  attestation: string;
}

// Invokes the deployed CRE confidential workflow's HTTP trigger (docs/architecture.md #2.2,
// cre/main.go onPullRequest). NOTE: CRE HTTP triggers authenticate callers via signed requests
// against the workflow's AuthorizedKeys (docs.chain.link/cre/guides/workflow/using-triggers/
// http-trigger/triggering-deployed-workflows) -- request signing isn't wired in here yet since
// there's no deployed workflow to sign against and verify. See api/README.md.
export async function invokeCreWorkflow(request: CrePullRequest): Promise<SignedVerdict> {
  const url = process.env.CRE_WORKFLOW_URL;
  if (!url) throw new Error("CRE_WORKFLOW_URL is not set");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRE workflow returned ${res.status}: ${text}`);
  }

  return (await res.json()) as SignedVerdict;
}

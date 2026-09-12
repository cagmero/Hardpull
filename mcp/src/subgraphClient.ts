// Queries the Sepolia manifest (Furnisher standing + FurnishedCommitment proofs) --
// mcp/README.md explains why Inquiry data comes from the Hardpull API instead of the subgraph:
// VerdictAttestations only stores an opaque verdictHash onchain, not the plaintext verdict
// level or pullerHash, so the Inquiry entity in schema.graphql has nothing to index it from.
const SEPOLIA_SUBGRAPH_URL = process.env.SUBGRAPH_SEPOLIA_URL;

async function query<T>(gql: string, variables: Record<string, unknown>): Promise<T> {
  if (!SEPOLIA_SUBGRAPH_URL) throw new Error("SUBGRAPH_SEPOLIA_URL is not set");

  const res = await fetch(SEPOLIA_SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: gql, variables }),
  });
  if (!res.ok) throw new Error(`subgraph query failed: ${res.status}`);

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

export interface FurnisherStandingResult {
  furnisher: {
    id: string;
    ensName: string | null;
    freshRecordCount: number;
    pullAllowance: number;
    standingUpdatedAt: string;
  } | null;
}

export async function getFurnisherStanding(furnisherId: string): Promise<FurnisherStandingResult["furnisher"]> {
  const result = await query<FurnisherStandingResult>(
    `query($id: ID!) { furnisher(id: $id) { id ensName freshRecordCount pullAllowance standingUpdatedAt } }`,
    { id: furnisherId.toLowerCase() },
  );
  return result.furnisher;
}

export interface FurnishedCommitmentsResult {
  furnishedCommitments: { furnisher: { id: string }; version: string; updatedAt: string }[];
}

export async function getFurnishingActivity(subjectId: string): Promise<FurnishedCommitmentsResult["furnishedCommitments"]> {
  const result = await query<FurnishedCommitmentsResult>(
    `query($subjectId: String!) {
       furnishedCommitments(where: { subject: $subjectId }, orderBy: updatedAt, orderDirection: desc, first: 50) {
         furnisher { id }
         version
         updatedAt
       }
     }`,
    { subjectId: subjectId.toLowerCase() },
  );
  return result.furnishedCommitments;
}

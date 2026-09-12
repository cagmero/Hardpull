import type { CrePublicPosition } from "./creClient.js";

const QUERY = /* GraphQL */ `
  query PositionsForWallets($wallets: [String!]!) {
    subjects(where: { id_in: $wallets }) {
      positions {
        protocol
        principal
        status
        originatedAt
      }
    }
  }
`;

// Fetches a subject's public-protocol exposure across the wallets bound to them
// (docs/architecture.md #2.2 "publicExposure"). Fails open, not closed: an unreachable or
// undeployed subgraph degrades the verdict's data quality (CRE's INSUFFICIENT_DATA path) rather
// than hard-failing the pull -- see docs/architecture.md #5 "Subgraph lag".
export async function getPublicExposure(wallets: string[]): Promise<CrePublicPosition[]> {
  const url = process.env.SUBGRAPH_URL;
  if (!url || wallets.length === 0) return [];

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { wallets: wallets.map((w) => w.toLowerCase()) } }),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: { subjects?: { positions: { protocol: string; principal: string; status: string; originatedAt: string }[] }[] };
    };

    const positions = json.data?.subjects?.flatMap((s) => s.positions) ?? [];
    return positions.map((p) => ({
      sourceId: p.protocol,
      principal: p.principal,
      status: p.status,
      originatedAt: new Date(Number(p.originatedAt) * 1000).toISOString(),
    }));
  } catch {
    return [];
  }
}

# hardpull-subgraph

Normalized cross-protocol credit schema. One `CreditPosition` shape across Aave v3, Morpho Blue,
Maple (Ethereum mainnet) and the Hardpull contracts (Sepolia). The normalized schema is the
deliverable, not the index itself — see `docs/plan.md` T-036 for the composability proof.

## Note on the two manifests

Subgraph Studio deploys one network per subgraph, so this is split into two manifests sharing one
`schema.graphql`:

- `subgraph.mainnet.yaml` — Aave v3 / Morpho Blue / Maple ingestion (T-031..T-033)
- `subgraph.sepolia.yaml` — Hardpull contract indexing (T-034)

The API and CRE workflow query both and merge results; this is a deliberate refinement of
`docs/architecture.md` §2.4's single-schema framing, not a scope change — the schema is still one
shape across all four sources.

## Setup

```bash
pnpm --filter @hardpull/subgraph codegen:mainnet
pnpm --filter @hardpull/subgraph build:mainnet
# fill in real addresses/startBlocks/ABIs first -- see TODOs in each manifest
```

# hardpull-subgraph

Normalized cross-protocol credit schema. One `CreditPosition` shape across Aave v3, Morpho Blue,
Maple (Ethereum mainnet) and the Hardpull contracts (Sepolia). The normalized schema is the
deliverable, not the index itself — see `docs/plan.md` T-036 for the composability proof.

**Status:** both manifests `codegen` and `build` cleanly to real WASM binaries against the actual
`@graphprotocol/graph-cli`. Not yet deployed — that needs a Subgraph Studio API key and real
contract addresses/start blocks (all currently `0x0…0` placeholders, marked `# TODO`).

## Note on the two manifests

Subgraph Studio deploys one network per subgraph, so this is split into two manifests sharing one
`schema.graphql`:

- `subgraph.mainnet.yaml` — Aave v3 / Morpho Blue / Maple ingestion (T-031..T-033)
- `subgraph.sepolia.yaml` — Hardpull contract indexing (T-034)

The API and CRE workflow query both and merge results; this is a deliberate refinement of
`docs/architecture.md` §2.4's single-schema framing, not a scope change — the schema is still one
shape across all four sources.

## Other refinements made while implementing the mappings

- **`Subject.id` is a wallet address for public positions, not a Hardpull `subjectId`.** Public
  protocols have no World ID binding at the protocol level — the subgraph only ever sees a
  wallet. The API joins wallet → `subjectId` via `SubjectRegistry.walletToSubject` at query time.
  Only the Sepolia-side `FurnishedCommitment` mapping uses a real `subjectId` (it's an event
  parameter there).
- **Maple has no fixed loan address.** Each loan is its own proxy instance deployed by a factory
  (verified against `maple-labs/fixed-term-loan` and `maple-labs/maple-proxy-factory` on GitHub).
  `subgraph.mainnet.yaml` listens to the factory's `InstanceDeployed` event and spins up a
  `MapleLoan` data source template per loan, per the standard Graph factory/template pattern.
- **`FurnishedCommitment` is a separate entity from `CreditPosition`.** `ExposureCommitments`
  only ever emits `keccak256(ciphertext)` — there's no principal to put in a `CreditPosition`
  without decrypting, which only the CRE enclave can do. Fabricating one would defeat the point.
- **`ReciprocityLedger` mirroring is best-effort, not authoritative.** The contract's
  `freshRecordCount()` applies a time-based decay computed at *read* time; a subgraph handler
  only fires on writes and can't replicate that exactly. The API's hourly reconciliation against
  on-chain state (`docs/architecture.md` §3.2) is the source of truth for pull decisions.

## Setup

```bash
pnpm --filter @hardpull/subgraph codegen:mainnet && pnpm --filter @hardpull/subgraph build:mainnet
pnpm --filter @hardpull/subgraph codegen:sepolia && pnpm --filter @hardpull/subgraph build:sepolia
# fill in real addresses/startBlocks first -- see TODOs in each manifest
```

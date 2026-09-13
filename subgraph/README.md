# hardpull-subgraph

Normalized cross-protocol credit schema. One `CreditPosition` shape across Aave v3, Morpho Blue,
Maple (Ethereum mainnet) and the Hardpull contracts (Sepolia). The normalized schema is the
deliverable, not the index itself — see `docs/plan.md` T-036 for the composability proof.

**Status:** both manifests `codegen` and `build` cleanly to real WASM binaries against the actual
`@graphprotocol/graph-cli`, and the mainnet manifest now carries **verified** addresses and real
deployment start blocks. Not yet deployed — that needs a Subgraph Studio API key. The Sepolia
manifest's addresses are filled in automatically from a deploy by
`node scripts/sync-deployments.mjs`.

### How the mainnet addresses were established

Not recalled from memory — each was confirmed by calling a method only the real contract could
answer, and each start block found by binary-searching an archive node for the first block with
code at that address.

| Data source | Address | Start block | How it was confirmed |
|---|---|---|---|
| Aave v3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | 16291127 | `ADDRESSES_PROVIDER()` returns Aave's canonical v3 provider `0x2f39d2…94E9e` |
| Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | 18883124 | `owner()` and `DOMAIN_SEPARATOR()` both respond |
| Maple `fixedTermLoanFactoryV2` | `0xeA067DB5B32CE036Ee5D8607DBB02f544768dBC6` | 18777478 | `defaultVersion()` is 601 under `mapleGlobals` `0x804a6F…390C` |

**Maple is the least-verified of the three, and that is worth stating.** The registry lists two
fixed-term loan factories; V1 (`0x36a735…1db0`) reports `defaultVersion() == 0`, i.e. retired, so
the manifest uses V2. The address and the `InstanceDeployed` ABI are confirmed, but no live
`InstanceDeployed` event was observed in the block windows sampled — originations are infrequent,
so absence across a sample proves nothing either way. Treat Maple origination coverage as
unproven until the subgraph is actually deployed and indexing. `docs/plan.md` T-033 anticipates
exactly this ("falls back gracefully if ABI coverage is partial; gaps documented").

### Start blocks and sync time

The start blocks above are the true deployment blocks, so nothing is missed — but indexing Aave
from January 2023 is years of history and will not sync quickly. If the demo only needs recent
positions, raise the `startBlock` values to something recent. The trade-off is explicit: the
subgraph then sees only positions originated after that block.

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
# mainnet addresses are already filled in and verified; the sepolia manifest is populated by
# `node scripts/sync-deployments.mjs` after contracts/script/Deploy.s.sol runs against Sepolia
```

# The Graph Integration Write-Up

## What we built

One normalized `CreditPosition` schema (`subgraph/schema.graphql`) across three heterogeneous
lending protocols plus Hardpull's own contracts:

- **Aave v3** (`src/mappings/aave.ts`) — `Borrow`/`Repay`/`LiquidationCall`, event signatures
  verified against `aave-v3-core`'s actual `IPool.sol` on GitHub, not recalled from memory.
- **Morpho Blue** (`src/mappings/morpho.ts`) — `Borrow`/`Repay`/`Liquidate`, verified against
  `morpho-blue`'s `EventsLib.sol`. Morpho's events carry a market `id`, not a token address, so
  the mapping calls `idToMarketParams()` on the Morpho contract to resolve the actual loan token.
- **Maple** — verified against real source (`maple-labs/fixed-term-loan`,
  `maple-labs/maple-proxy-factory`) turned up a fact the original architecture doc didn't account
  for: **Maple has no fixed loan address.** Each loan is its own proxy instance deployed by a
  factory. The mapping listens to the factory's `InstanceDeployed` event and spins up a
  `MapleLoan` data source template per loan — the standard Graph factory/template pattern,
  applied because the naive fixed-address design in the original plan simply doesn't match how
  Maple actually works onchain.
- **Hardpull's own contracts** (`src/mappings/hardpull.ts`) on Sepolia — `ExposureCommitments`
  and `ReciprocityLedger` events, indexed into a `FurnishedCommitment` entity that deliberately
  has no principal/currency field, since the subgraph only ever sees `keccak256(ciphertext)`.

**What became easier because of the shared schema:** an underwriting decision needs "how much
does this borrower already owe, anywhere public," and before this schema existed that meant three
separate protocol-specific queries with three different event shapes, three different units, and
Maple's factory indirection to handle by hand each time. After: one `CreditPosition` shape, one
query, and the CRE workflow's aggregation logic never needs to know which protocol a record came
from — `docs/architecture.md`'s STEPS pseudocode just sums `principal` across whatever's in
`publicExposure[]`.

## Why it's load-bearing

Public-protocol exposure is half of every verdict's input. A single-protocol query produces a
blind verdict — a borrower undercollateralized on Morpho but clean on Aave looks clean to a
single-protocol check. The normalization across three heterogeneous event shapes, including
correctly handling Maple's factory pattern, is the actual contribution; querying one already-live
subgraph would not have been.

## What's verified vs. what still needs deployment

**Verified without a Subgraph Studio account:** both manifests (`subgraph.mainnet.yaml`,
`subgraph.sepolia.yaml` — split because Subgraph Studio deploys one network per subgraph, sharing
one `schema.graphql`) run `graph codegen` and `graph build` cleanly against the real
`@graphprotocol/graph-cli`, producing genuine WASM binaries per data source. Every ABI used was
either extracted from our own compiled contracts (`forge inspect`) or hand-verified against real
source on GitHub — not fabricated.

**Not yet verified — needs a Subgraph Studio API key and real contract addresses:** actual
deployment and indexing. Every `address`/`startBlock` in both manifests is currently a `0x0…0`
placeholder marked `# TODO`. The cross-protocol composability proof (T-036 — one query returning
one borrower's positions across all three protocols) needs a live index to run against and is not
yet captured.

## MCP server against the subgraph

`mcp/` implements `get_furnisher_standing` and part of `get_credit_file` as live GraphQL queries
against the Sepolia manifest — verified working over stdio (initialize handshake and `tools/list`
both confirmed against the running server), pending the same subgraph deployment.

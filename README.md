# Hardpull

A confidential exposure registry for onchain credit. Hardpull lets undercollateralized lenders
detect loan stacking — a borrower drawing simultaneous credit from several lenders who each believe
the borrower is unencumbered — without any lender ever seeing another lender's book.

```
POST /v1/pull  →  { verdict, exposureBucket, inquiryVelocity, stackingFlag }
```

Built for ETHOnline 2026 (Start Fresh / Net-New track). Full context, spec, architecture, and
implementation plan live in [`docs/`](./docs).

## Repo layout

This is a monorepo — every Hardpull component lives here as a workspace package rather than a
separate repo.

| Path | Component | Stack |
|---|---|---|
| [`contracts/`](./contracts) | Core protocol on Ethereum Sepolia | Solidity 0.8.24, Foundry, OpenZeppelin |
| [`cre/`](./cre) | Chainlink CRE Confidential Workflow | Go, CRE Workflow SDK |
| [`api/`](./api) | Bureau API — the product surface | TypeScript, Hono, Postgres, Redis, Zod |
| [`subgraph/`](./subgraph) | Normalized cross-protocol credit schema | The Graph, AssemblyScript |
| [`mcp/`](./mcp) | Subgraph MCP server + SKILL | TypeScript, MCP SDK |
| [`console/`](./console) | Lender console + borrower file viewer | Next.js 15, wagmi, viem, Tailwind |
| [`demo-lenders/`](./demo-lenders) | Two mock lender apps for the demo video | Next.js |
| [`sdk-node/`](./sdk-node) | Typed client SDK | TypeScript (hand-written for now; OpenAPI codegen is T-05B) |
| [`packages/types/`](./packages/types) | Shared types + Zod schemas | TypeScript |
| [`docs/`](./docs) | Spec, architecture, plan, sponsor strategy, decisions | Markdown |

## Getting started

```bash
pnpm install
```

Each package's own README documents how to run/build it individually. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit conventions.

## Status

All nine components are implemented and each has been independently verified — not just built:

- **`contracts/`** — 36 Foundry tests pass, including a 10,000-run fuzz test proving the
  disclosure invariant. Smoke-tested end-to-end against a local Anvil node.
- **`cre/`** — the confidential workflow compiles to a genuine WASM binary against the real,
  public `cre-sdk-go`. Its sealed-box encryption was proven byte-for-byte interoperable with the
  TypeScript implementation furnishers use, in both directions, with a real keypair.
- **`subgraph/`** — both manifests build to real WASM against `graph-cli`, with every event
  signature verified against each protocol's actual source (not recalled from memory).
- **`api/`** — the full short-circuit chain (auth → idempotency → consent → standing → x402 →
  compute) was run live against real Postgres, Redis, and Anvil: real furnisher registration,
  real HMAC-signed onchain writes, real idempotency replay, real wallet-signed consent grants.
- **`console/`**, **`demo-lenders/`** — functional UI wired to the live API, verified by actually
  running the furnish → grant consent → autonomous-agent-pulls flow end to end.
- **`mcp/`** — all four tools registered and confirmed live over stdio.

What's *not* yet live: anything needing an external account this environment doesn't have —
a Chainlink CRE login, a funded Hedera testnet account, a Subgraph Studio deployment, a
registered World ID app. Each of those fails with a clear, typed error at exactly that boundary
rather than silently no-op'ing. See [`docs/DECISIONS.md`](./docs/DECISIONS.md) for the full
status log, each package's own README for what it specifically needs, and
[`docs/partners/`](./docs/partners) for the per-partner integration write-ups.

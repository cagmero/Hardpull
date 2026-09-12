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
| [`sdk-node/`](./sdk-node) | Typed client SDK | TypeScript, generated from OpenAPI |
| [`packages/types/`](./packages/types) | Shared types + Zod schemas | TypeScript |
| [`docs/`](./docs) | Spec, architecture, plan, sponsor strategy, decisions | Markdown |

## Getting started

```bash
pnpm install
```

Each package's own README documents how to run/build it individually. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit conventions.

## Status

Early scaffold. See [`docs/plan.md`](./docs/plan.md) for the full workstream breakdown and
[`docs/DECISIONS.md`](./docs/DECISIONS.md) for the CRE viability gate (T-014) once decided.

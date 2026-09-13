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
| [`sdk-node/`](./sdk-node) | Typed client SDK | TypeScript, generated from `api/openapi.yaml` |
| [`packages/types/`](./packages/types) | Shared types + Zod schemas | TypeScript |
| [`docs/`](./docs) | Spec, architecture, plan, sponsor strategy, decisions | Markdown |

## Getting started

```bash
pnpm install
./scripts/dev-stack.sh up     # Postgres, Redis, Anvil + contracts, CRE gateway, API
```

Then run the success criteria as an executable gate:

```bash
cd api && pnpm exec tsx src/scripts/e2e-scenario.ts --runs 3
```

`dev-stack.sh` is a **local rehearsal** stack: payments are skipped
(`HARDPULL_X402_MODE=disabled`) and compute runs against `cre/cmd/localgateway`, which executes
the same handler code but is not a TEE. `GET /health/ready` always reports which of those are in
effect. Neither may be used for a demo recording or a deployment — see
[`docs/demo-video-script.md`](./docs/demo-video-script.md).

Requires Docker, Go 1.25+, Foundry and Node 20+. Each package's own README documents how to run
and build it individually; see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit conventions.

## Status

The full product narrative runs end to end. `docs/spec.md` §8's success criteria are an
executable gate, not a checklist — `api/src/scripts/e2e-scenario.ts` asserts every step and
currently passes **3/3 consecutive clean runs** (`docs/plan.md` T-090):

```
✓ Consent gate                 a pull with no grant is refused 403 before compute or payment
✓ Consent is not transferable  Lender A presenting Lender B's token is refused 403
✓ Verdict                      CRITICAL — 50k-250k, flags ["MULTI_ORIGINATION_48H"]
✓ Disclosure limits            verdict names no furnisher, no exact amount, no counterparty
✓ Idempotency                  replay returned the cached verdict and logged no second inquiry
✓ SDK pull                     @hardpull/sdk-node returned CRITICAL against the live API
✓ Revocation                   the next pull after revoking is refused 403
```

Component by component, each independently verified — not just built:

- **`cre/`** — **the T-014 viability gate is closed.** `cre workflow simulate` runs the real
  Confidential Workflow and returns a signed `CRITICAL` verdict for the stacking scenario. Ten
  tests exercise the actual TEE handler through the SDK's `testutils` runtime, including the one
  that matters most: plaintext, furnisher identity and both private keys appear in neither the
  returned verdict nor any enclave log.
- **`contracts/`** — 36 Foundry tests pass, including a 10,000-run fuzz test on the disclosure
  invariant. Deployed to Anvil and exercised end to end; `VerdictAttestations.verify()` returns
  `true` for a verdict signed by the workflow.
- **`api/`** — the full short-circuit chain (auth → idempotency → consent → standing → x402 →
  compute) runs live against real Postgres, Redis and a chain. 43 tests. `GET /health/ready`
  reports exactly which integrations are live.
- **`subgraph/`** — both manifests build to real WASM, now with mainnet addresses confirmed by
  live contract calls and start blocks found by binary-searching an archive node.
- **`console/`, `demo-lenders/`, `mcp/`, `sdk-node/`** — all build in CI; the SDK performs a real
  pull against the live API as part of the gate.

**What is not live**, unchanged in kind: everything needing an external account this environment
doesn't have — CRE *deploy* access (private beta; simulation needed none), a funded Hedera
testnet account, a Subgraph Studio deployment, a World ID app, and `hardpull.eth` on Sepolia.
Each fails with a specific typed error at exactly that boundary rather than silently no-op'ing.

Two switches exist so the flow can be rehearsed before those accounts do: `cre/cmd/localgateway`
(the same handler code over HTTP — **not a TEE**, and it says so on startup) and
`HARDPULL_X402_MODE=disabled` (skips payment; logs a warning on every request and is reported as
`BYPASSED` by `/health/ready`). Neither is on by default, and no demo may run with them on.

See [`docs/DECISIONS.md`](./docs/DECISIONS.md) for the full status log — including the two bugs
that only surfaced by actually running the workflow — each package's README for what it
specifically needs, and [`docs/partners/`](./docs/partners) for the per-partner write-ups.

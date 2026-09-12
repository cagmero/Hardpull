# Hardpull: Implementation Plan

Segmented by **task**, not by day. Each task has an ID, explicit dependencies, a deliverable, and
acceptance criteria. Nothing is "done" until acceptance criteria pass.

**Legend:** `[BLOCKER]` = downstream work cannot start · `[GATE]` = go/no-go decision point ·
`[DEMO]` = required for the submission video

---

## Workstream 0 — Foundations

### T-001 · Repo scaffolding and commit discipline `[BLOCKER]`
**Depends on:** none
**Deliverable:** All nine repos created, public, with README, LICENSE, and `.gitignore`.
**Acceptance:**
- Nine repos exist and are public
- Each has an initial commit timestamped after the event start
- `CONTRIBUTING.md` states the commit rule: small, frequent, descriptive commits
- These five `.md` files are committed to `hardpull-docs` (required if AI-assisted workflows are used)

### T-002 · Shared types package
**Depends on:** T-001
**Deliverable:** `@hardpull/types` — TypeScript types for `Subject`, `PositionRecord`, `PullRequest`,
`Verdict`, `ConsentGrant`, `FurnisherStanding`. Zod schemas alongside.
**Acceptance:** Package builds; imported cleanly by api, sdk, console, mcp.

### T-003 · Environment and secrets
**Depends on:** T-001
**Deliverable:** `.env.example` in every repo; Sepolia and Hedera testnet accounts funded; Supabase,
Upstash, Vercel projects created.
**Acceptance:** Sepolia deployer has ≥0.5 ETH; Hedera account funded; all services reachable.

---

## Workstream 1 — Chainlink CRE Spike `[BLOCKER]` `[GATE]`

> Run this **first and in parallel with nothing else that depends on it**. This is the single
> highest-risk component. If it fails, the product thesis fails and the fallback in T-015 activates.

### T-010 · CRE toolchain up and running
**Depends on:** T-003
**Deliverable:** CRE CLI installed; Go toolchain configured; hello-world workflow simulated locally.
**Acceptance:** `cre workflow simulate` runs a trivial workflow and prints output.

### T-011 · Confidential input handling proven
**Depends on:** T-010
**Deliverable:** A workflow that accepts an encrypted payload, decrypts inside the enclave, and
returns a derived value without echoing the input.
**Acceptance:** Encrypted input in, computed output out, plaintext never appears in any log or return value.

### T-012 · HTTP fetch from workflow
**Depends on:** T-010
**Deliverable:** Workflow fetches from an external HTTPS endpoint (the subgraph query URL).
**Acceptance:** Workflow returns data retrieved from the subgraph during simulation.

### T-013 · Verdict signing
**Depends on:** T-011
**Deliverable:** Workflow signs its output payload with the workflow key; signature verifiable externally.
**Acceptance:** A Node script independently verifies a workflow-produced signature.

### T-014 · GATE — CRE viability decision `[GATE]`
**Depends on:** T-011, T-012, T-013
**Decision:** If T-011 through T-013 all pass, proceed with CRE as the confidential join. If any fails
after a bounded spike, activate T-015.
**Acceptance:** Decision recorded in `hardpull-docs/DECISIONS.md` with date and rationale.

### T-015 · Fallback path (only if T-014 fails)
**Depends on:** T-014 negative
**Deliverable:** Replace the TEE with a threshold-encryption scheme or a documented trusted-operator
model, and swap the third partner selection from Chainlink to Arc.
**Acceptance:** Architecture doc updated; the disclosure guarantee is restated honestly at the weaker level.

---

## Workstream 2 — Smart Contracts

### T-020 · Foundry project and CI
**Depends on:** T-001
**Deliverable:** `hardpull-contracts` with Foundry, OpenZeppelin, GitHub Actions running `forge test`.
**Acceptance:** CI green on an empty test suite.

### T-021 · `SubjectRegistry`
**Depends on:** T-020
**Deliverable:** Nullifier → subjectId mapping; wallet binding; rebinding rejection.
**Acceptance:** Tests cover — bind new subject, bind second wallet, reject rebinding a bound wallet,
reject duplicate nullifier.

### T-022 · `FurnisherRegistry`
**Depends on:** T-020
**Deliverable:** Furnisher registration, ENS subname record, public key storage, suspend/reactivate.
**Acceptance:** Tests cover registration, key rotation, suspension blocking furnish writes.

### T-023 · `ExposureCommitments`
**Depends on:** T-021, T-022
**Deliverable:** Append-only commitment writes with versioning; events for subgraph ingestion.
**Acceptance:** Tests cover — write, version increment on status change, reject write from unregistered
furnisher, reject write for unknown subject. Events emitted with all indexed fields.

### T-024 · `ReciprocityLedger`
**Depends on:** T-023
**Deliverable:** Fresh-record counting, allowance computation, 90-day decay, governable `K` and `BASE_ALLOWANCE`.
**Acceptance:** Tests cover — allowance rises with furnishing, decays after 90 days, non-furnisher
receives exactly `BASE_ALLOWANCE`, only owner can change parameters.

### T-025 · `VerdictAttestations`
**Depends on:** T-020
**Deliverable:** Store verdict hash + CRE signature + inquiry ID; public verification view function.
**Acceptance:** Tests cover write, retrieval, and independent signature verification on-chain.

### T-026 · Deployment scripts and Sepolia deploy `[BLOCKER]`
**Depends on:** T-021…T-025
**Deliverable:** Foundry deploy script; addresses written to a shared `deployments.json`.
**Acceptance:** All five contracts verified on Sepolia Etherscan; addresses published in docs.

### T-027 · Invariant tests for disclosure limits
**Depends on:** T-025
**Deliverable:** Fuzz/invariant tests asserting no contract event or view ever emits a furnisher
identity alongside a subject's position detail.
**Acceptance:** Invariant suite passes over 10,000 runs.

---

## Workstream 3 — Subgraph

### T-030 · Normalized schema
**Depends on:** T-001
**Deliverable:** `schema.graphql` per architecture.md §2.4.
**Acceptance:** Schema compiles; reviewed against all three target protocols for field coverage.

### T-031 · Aave v3 mappings
**Depends on:** T-030
**Deliverable:** Handlers for `Borrow`, `Repay`, `LiquidationCall` → `CreditPosition`.
**Acceptance:** Local indexing produces correct positions for a known mainnet address.

### T-032 · Morpho Blue mappings
**Depends on:** T-030
**Deliverable:** Handlers for `Borrow`, `Repay`, `Liquidate` → same shape.
**Acceptance:** Same as T-031.

### T-033 · Maple mappings
**Depends on:** T-030
**Deliverable:** Loan lifecycle events → same shape. Falls back gracefully if ABI coverage is partial.
**Acceptance:** At least origination and repayment indexed; gaps documented.

### T-034 · Hardpull contract mappings
**Depends on:** T-026, T-030
**Deliverable:** Index `ExposureCommitments`, `ReciprocityLedger`, `VerdictAttestations` on Sepolia.
**Acceptance:** Commitments and standing queryable within 60s of a transaction.

### T-035 · Deploy to Subgraph Studio `[BLOCKER]`
**Depends on:** T-031…T-034
**Deliverable:** Published subgraph, API key provisioned, query URL in `deployments.json`.
**Acceptance:** Live query returns real positions from mainnet protocols.

### T-036 · Cross-protocol normalization proof `[DEMO]`
**Depends on:** T-035
**Deliverable:** A single GraphQL query returning one borrower's positions across all three protocols
in one normalized shape, plus a short write-up of what became easier because of the shared schema.
**Acceptance:** Query result screenshot and write-up committed. This is the composability evidence.

---

## Workstream 4 — Confidential Workflow (production)

### T-040 · Verdict computation logic
**Depends on:** T-014 positive
**Deliverable:** Go implementation of stacking rules (spec.md §6.5) with table-driven unit tests.
**Acceptance:** ≥20 test cases covering every verdict branch and every threshold boundary.

### T-041 · Commitment verification in-enclave
**Depends on:** T-040, T-026
**Deliverable:** After decryption, recompute `keccak256(ciphertext)` and compare to on-chain commitment.
**Acceptance:** Tampered ciphertext is rejected and surfaces `DATA_INTEGRITY_WARNING`.

### T-042 · Exposure bucketing and field stripping `[BLOCKER]`
**Depends on:** T-040
**Deliverable:** Output struct with no furnisher-identifying fields, enforced at the Go type level.
**Acceptance:** A test asserts the serialized output contains none of: furnisher ID, exact principal,
rate, maturity, prior puller ID. **This test must exist and pass.**

### T-043 · Subgraph integration
**Depends on:** T-040, T-035
**Deliverable:** Workflow fetches public exposure from the subgraph and merges with decrypted records.
**Acceptance:** A subject with both public and private positions produces a correct aggregate.

### T-044 · Deploy workflow `[BLOCKER]`
**Depends on:** T-041, T-042, T-043
**Deliverable:** Workflow deployed and callable; public key published to `FurnisherRegistry`.
**Acceptance:** End-to-end invocation from a script returns a signed verdict.

---

## Workstream 5 — API Service

### T-050 · Hono scaffold and middleware chain
**Depends on:** T-002, T-003
**Deliverable:** Service skeleton with request-id, OAuth2, HMAC, IP allowlist, rate limit middleware.
**Acceptance:** Unauthenticated request → 401; bad HMAC → 401; valid request → 200 on a health route.

### T-051 · Postgres schema and migrations
**Depends on:** T-003
**Deliverable:** Tables — `subjects`, `wallets`, `furnishers`, `position_ciphertexts`, `consent_grants`,
`inquiries`, `verdicts`, `webhook_subscriptions`, `idempotency_keys`.
**Acceptance:** Migrations run clean up and down; foreign keys and indexes in place.

### T-052 · Idempotency middleware
**Depends on:** T-050
**Deliverable:** `Idempotency-Key` header → Redis cache of (key → response), 24h TTL.
**Acceptance:** Identical repeated request returns the cached response and performs no side effects.

### T-053 · `POST /v1/subjects` — World ID binding
**Depends on:** T-051, T-021, T-070
**Deliverable:** Verify World ID proof, derive subjectId, register on-chain, bind wallet.
**Acceptance:** Valid proof → subject created; replayed nullifier → 409; invalid proof → 400.

### T-054 · `POST /v1/furnish` and `/v1/furnish/batch`
**Depends on:** T-052, T-023
**Deliverable:** Accept sealed box, store ciphertext, write commitment on-chain, update standing.
**Acceptance:** Record stored; commitment matches `keccak256(ciphertext)`; on-chain write confirmed;
unregistered furnisher rejected.

### T-055 · `DELETE /v1/furnish/{recordId}` — status transitions
**Depends on:** T-054
**Deliverable:** Mark `REPAID` / `DEFAULTED` / `CLOSED` as a new versioned record.
**Acceptance:** Version increments; prior version retained; `DEFAULTED` triggers a webhook.

### T-056 · `POST /v1/consent` and revocation
**Depends on:** T-051, T-071
**Deliverable:** Create and revoke ENSv2 EAC grants; mirror to Postgres.
**Acceptance:** Grant created on-chain and readable; revocation causes subsequent pulls to 403.

### T-057 · `POST /v1/pull` — the core endpoint `[BLOCKER]` `[DEMO]`
**Depends on:** T-052, T-044, T-056, T-024, T-060
**Deliverable:** Full short-circuit chain per architecture.md §2.3, CRE invocation, attestation write,
HCS log, response.
**Acceptance:**
- Missing consent → 403 before any compute or charge
- Insufficient standing → 402
- Missing payment → 402 with x402 challenge
- Valid request → signed verdict in < 8s p95
- Response contains no furnisher-identifying field (asserted by test)
- Inquiry appears in HCS within 30s
- Retry with same idempotency key returns cached verdict, logs no second inquiry

### T-058 · `GET /v1/subjects/{id}/inquiries` and `GET /v1/pull/{inquiryId}`
**Depends on:** T-057
**Deliverable:** Borrower-visible inquiry history; verdict retrieval with attestation.
**Acceptance:** Borrower sees who pulled and when; puller identity hashed for third parties.

### T-059 · Webhooks
**Depends on:** T-051
**Deliverable:** Subscription management, HMAC-signed delivery, exponential backoff retry for 24h.
**Acceptance:** `stacking.detected` fires on a `CRITICAL` verdict; signature verifies; failed endpoint
retried with increasing delay.

### T-05A · Reconciliation job
**Depends on:** T-054, T-051
**Deliverable:** Hourly comparison of Postgres commitment counts and standing to on-chain state.
**Acceptance:** Injected drift is detected and logged.

### T-05B · OpenAPI spec and SDK generation
**Depends on:** T-057
**Deliverable:** `openapi.yaml`; `hardpull-sdk-node` generated and published.
**Acceptance:** SDK performs a full pull against the live API in an integration test.

---

## Workstream 6 — Payments and Audit (Hedera)

### T-060 · x402 metering on pulls `[BLOCKER]` `[DEMO]`
**Depends on:** T-050, T-003
**Deliverable:** `/v1/pull` returns HTTP 402 with an x402 challenge; accepts and verifies payment
receipts settled on Hedera Testnet.
**Acceptance:** Unpaid request → 402 with valid challenge; paid request → 200; replayed receipt → rejected.

### T-061 · Differential pricing by standing
**Depends on:** T-060, T-024
**Deliverable:** Pull price is a function of reciprocity standing — furnishers pay less.
**Acceptance:** Two callers with different standing receive different price quotes in the 402 challenge.

### T-062 · HCS inquiry topic
**Depends on:** T-003
**Deliverable:** HCS topic created; every inquiry submitted as a message with `(inquiryId, subjectIdHash,
pullerHash, verdict, timestamp)`.
**Acceptance:** Messages visible on a Hedera explorer; sequence numbers monotonic; no PII in payload.

### T-063 · Underwriting agent `[DEMO]`
**Depends on:** T-060, T-05B
**Deliverable:** An agent that receives a loan application, autonomously pays for and calls `/v1/pull`,
and returns an approve/decline decision — no API key provisioning, no human step.
**Acceptance:** Agent runs end to end from a single prompt and declines a stacked borrower.

---

## Workstream 7 — Identity and Consent

### T-070 · World ID Selfie Check integration
**Depends on:** T-003
**Deliverable:** Verification flow in the console; server-side proof verification; nullifier extraction.
**Acceptance:** Real verification completes; nullifier returned; replay rejected.

### T-071 · ENSv2 consent grants
**Depends on:** T-003
**Deliverable:** `hardpull.eth` on Sepolia; lender subnames; Enhanced Access Control grants carrying
`pullerId`, `expiresAt`, `maxPulls`.
**Acceptance:** Grant written and read on-chain; expiry enforced; revocation immediate; lender subname
resolves.

### T-072 · ERC-8004 agent identity *(stretch)*
**Depends on:** T-071
**Deliverable:** Agent-borrowers registered with ERC-8004 identity; credit file keyed to agent identity.
**Acceptance:** An agent subject can hold a credit file. Skip without penalty if time-constrained.

---

## Workstream 8 — Interfaces

### T-080 · Lender console
**Depends on:** T-054, T-057
**Deliverable:** Furnish form, pull form, standing dashboard, inquiry history.
**Acceptance:** A lender can complete furnish and pull entirely through the UI.

### T-081 · Borrower file viewer
**Depends on:** T-056, T-058
**Deliverable:** Own credit file, inquiry log, consent grant management with revoke.
**Acceptance:** Borrower grants access, sees the resulting pull in their log, revokes, and the next
pull fails.

### T-082 · Demo lenders A and B `[DEMO]`
**Depends on:** T-05B, T-063
**Deliverable:** Two minimal lender apps, visually distinct, each able to originate a loan and run a pull.
**Acceptance:** Both deployed publicly; the full stacking scenario runs from these two UIs side by side.

### T-083 · MCP server and SKILL `[DEMO]`
**Depends on:** T-035
**Deliverable:** MCP server exposing the four tools in architecture.md §2.5, plus a SKILL file.
**Acceptance:** A natural-language question about a subject's credit file returns a correct answer
sourced from the subgraph.

---

## Workstream 9 — Submission

### T-090 · End-to-end scenario rehearsal `[GATE]` `[DEMO]`
**Depends on:** T-057, T-060, T-062, T-082, T-083
**Deliverable:** The full success-criteria path (spec.md §8) executed cleanly, three consecutive times.
**Acceptance:** Three clean runs with no manual intervention. **If this gate fails, stop building
features and fix it.**

### T-091 · Architecture diagrams
**Depends on:** T-090
**Deliverable:** Rendered diagrams from architecture.md, exported as images.
**Acceptance:** Committed to `hardpull-docs` and embedded in the submission. Several partners require these.

### T-092 · Partner integration write-ups
**Depends on:** T-090
**Deliverable:** For each of the three selected partners: what was built, why their tech was load-bearing,
what would break without it.
**Acceptance:** Three write-ups, each naming a specific failure mode if the integration were removed.

### T-093 · Partner feedback artifacts
**Depends on:** T-090
**Deliverable:** Written feedback for each selected partner, in whatever form that partner requires
(file in repo, form submission, or both).
**Acceptance:** Verified against the live prizes page requirements for each selected partner. **Check
the page directly — requirements change.**

### T-094 · Demo video `[DEMO]`
**Depends on:** T-090
**Deliverable:** 2–4 minutes. Structure: the stacking problem (25s) → Lender A originates (20s) →
Lender B's agent pays, pulls, declines (40s) → proof Lender B learned nothing about Lender A (30s) →
HCS log and MCP query (30s) → limits stated honestly (15s).
**Acceptance:** Under 4 minutes; audible; no mocked data; runs against live deployments.

### T-095 · Docs site and public deployments
**Depends on:** T-05B, T-080, T-081
**Deliverable:** Docs live; API, console, viewer, and both demo lenders publicly reachable.
**Acceptance:** A stranger with only the submission link can reach and use everything.

### T-096 · Final submission
**Depends on:** T-090…T-095
**Deliverable:** Submission form completed.
**Acceptance:**
- **Exactly three partner prizes selected** — Hedera, The Graph, Chainlink (see `sponsor-integration.md`)
- Repo links public and correct
- Video under 4 minutes
- Spec files, prompts, and planning artifacts committed
- Commit history shows incremental progress
- Submitted before the deadline, not at it

---

## Critical Path

```
T-001 → T-010 → T-011/012/013 → T-014 [GATE] → T-040 → T-042 → T-044
                                                              ↓
T-020 → T-023 → T-026 ────────────────────────────────────→ T-057 → T-090 [GATE] → T-094 → T-096
                    ↓                                         ↑
T-030 → T-035 ──────┴──────────────────────────────────────→ T-060
```

**Everything else is parallelizable.** If a resource conflict arises, the critical path wins.

---

## Suggested Parallelization

| Role | Owns |
|---|---|
| Go / infra engineer | WS-1, WS-4 (highest risk — start immediately) |
| Solidity engineer | WS-2, then T-071 |
| Backend engineer | WS-5, WS-6 |
| Data engineer | WS-3, T-083 |
| Frontend engineer | WS-8, T-070, then WS-9 |

If the team is smaller than five, collapse frontend into backend and treat WS-8 as post-T-057 work.
Never collapse WS-1 into another role — it needs one person's undivided attention until T-014 clears.

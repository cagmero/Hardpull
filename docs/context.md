# Hardpull: Project Context

> **Status:** New build — Start Fresh (net-new) track, ETHOnline 2026
> **Chains:** Ethereum Sepolia (core protocol + ENSv2) · Hedera Testnet (metering + audit log)
> **Submission deadline:** September 16, 2026
> **Last updated:** 2026-09-12

---

## 1. Overview

Hardpull is a **confidential exposure registry for onchain credit**. It lets undercollateralized
lenders detect **loan stacking** — a borrower drawing simultaneous credit from several lenders who
each believe the borrower is unencumbered — without any lender ever seeing another lender's book.

The entire product is one API call:

```
POST /v1/pull  →  { verdict, exposureBucket, inquiryVelocity, stackingFlag }
```

No loan book is exposed. No counterparty is named. No amount is revealed.

---

## 2. Track Decision: Start Fresh (Net-New)

**Decision: we enter the Classic "Start Fresh" track. No Continuity.**

Rationale:

| Factor | Assessment |
|---|---|
| Existing repos | Scattered across Algorand (PuyaTS) and a dead EVM branch; no clean lineage |
| Porting cost | Algorand contracts do not translate to EVM; gluing repos together is high-risk, low-reward |
| Rules exposure | Continuity requires documented pre-existing work and clean version control; a stitched repo invites disqualification |
| Judging | Only work done during the event is judged anyway — Continuity buys nothing here |

**Hard consequence of this decision:** *all* project-specific code must be written after the
hackathon starts. Public libraries, boilerplate, and starter kits are permitted. Prior Irion code is
**not** to be copy-pasted in. Design patterns and architectural knowledge carry over; source does not.

### What carries over as knowledge (not code)

From prior work on Irion Network, the following patterns are re-implemented from scratch here
because they are what separates a production API from a hackathon toy:

- Idempotency keys on all mutating endpoints (Redis-backed, 24h TTL)
- HMAC request signing layered over OAuth2 client-credentials
- Signed webhooks with exponential-backoff retry
- Indexer → Postgres mirror with hourly reconciliation against chain state
- Multi-dimensional credit file format (repayment / volume / tenure / concentration)

---

## 3. Repositories & Roles

### ⛓️ `hardpull-contracts`
- **Role:** Core protocol logic on Ethereum Sepolia.
- **Stack:** Solidity 0.8.24, Foundry, OpenZeppelin.
- **Contains:** `SubjectRegistry`, `FurnisherRegistry`, `ExposureCommitments`, `ReciprocityLedger`, `VerdictAttestations`.
- **Notes:** Deliberately thin. Contracts hold commitments, standing, and attestations — never plaintext positions.

### 🔐 `hardpull-cre`
- **Role:** Chainlink CRE Confidential Workflow. The confidential join lives here.
- **Stack:** Go (CRE workflow SDK), CRE CLI for local simulation.
- **Notes:** **Highest schedule risk in the project.** If this stalls, the entire product thesis fails.
  Must be spiked in the first workstream, not deferred.

### 🌐 `hardpull-api`
- **Role:** The bureau API. The product surface institutions integrate against.
- **Stack:** TypeScript, Hono, Postgres (Supabase), Redis (Upstash), Zod, OpenAPI 3.1.
- **Notes:** Orchestrates consent checks, reciprocity checks, x402 settlement, CRE invocation, and
  attestation writes. Never sees decrypted furnished records — it passes ciphertext through.

### 📊 `hardpull-subgraph`
- **Role:** Public-furnisher ingestion. Normalized cross-protocol credit schema.
- **Stack:** The Graph, AssemblyScript, Subgraph Studio.
- **Indexes:** Aave v3, Morpho Blue, Maple (Ethereum mainnet, read-only, for *real* data) plus the
  Hardpull contracts on Sepolia.
- **Notes:** The normalized schema is the deliverable, not the index itself. One schema across three
  lending protocols is what makes this a "standardized subgraph" rather than a query.

### 🤖 `hardpull-mcp`
- **Role:** Subgraph MCP server + SKILL so an underwriting agent can query a credit file in natural language.
- **Stack:** TypeScript, MCP SDK.
- **Notes:** Consumes `hardpull-subgraph` via Subgraph MCP. This is the AI-tooling surface.

### 🖥️ `hardpull-console`
- **Role:** Lender console (furnish, pull, standing) + borrower file viewer (inquiries, consent grants).
- **Stack:** Next.js 15, wagmi, viem, Tailwind.

### 🏦 `hardpull-demo-lenders`
- **Role:** Two mock lender dashboards, "Lender A" and "Lender B", used solely for the demo video.
- **Stack:** Next.js.
- **Notes:** Exists so the stacking scenario can be shown from both sides simultaneously.

### 📦 `hardpull-sdk-node`
- **Role:** Typed client. `hardpull.pull({ subjectId, proposedPrincipal })`.
- **Stack:** TypeScript, generated from OpenAPI spec.

### 📄 `hardpull-docs`
- **Role:** API reference + protocol explainer + architecture diagrams.
- **Stack:** Next.js, MDX (or Mintlify).

---

## 4. Competitive Landscape

Every existing player builds a **model** on data that is already public. None operate the
**furnishing side**.

| Player | Approach | Blind to |
|---|---|---|
| Cred Protocol / Blockchain Bureau | Score from public chain data; 500M+ addresses, 8 chains, 100+ protocols | Anything a lender holds privately |
| Spectral (MACRO) | Wallet behavior → risk score | Same |
| Credora | Borrower proves solvency without full disclosure | Single counterparty at a time; not a shared registry |
| 3Jane | zkTLS pulls *offchain* VantageScore onchain | Onchain lender-held exposure |
| RociFi / Zeru / ChainAware | Scoring models on public data | Same |
| Divine Research (May 2026) | Delegated underwriting via sponsor credit paths | Different solution to the same Sybil problem; not a registry |

**The gap:** in traditional credit, the overwhelming majority of a credit file is *furnished tradeline
data* contributed reciprocally by lenders. The bottleneck was never the scoring model — it is that no
lender will hand a competitor their book. A TEE removes that objection. Nobody has built this.

**Corroborating signal:** the August 2026 Protocol Roundtable #3 identified undercollateralized
lending plus *selective disclosure* as the frontier, under the stated mantra "verify, don't reveal."
The blocker is widely named. It is not yet solved.

---

## 5. The Specific Failure We Address

A borrower draws $50k undercollateralized from Lender A. Twelve minutes later, from Lender B. Then
from a private desk. Each lender sees a clean borrower — because none can see the others'
originations, and private credit never touches the chain at all.

This is **stacking**. It is a named fraud vector that destroyed a generation of merchant cash advance
lenders. Onchain it is structurally worse: origination is instant, permissionless, and there is no
inquiry record anywhere.

---

## 6. Core Design Decisions (Source of Truth)

| Decision | Choice | Reason |
|---|---|---|
| Core chain | Ethereum Sepolia | ENSv2 beta lives here; subgraphs index it; EVM tooling is mature |
| Metering + audit chain | Hedera Testnet | x402 settlement and HCS tamper-evident inquiry log |
| Confidential compute | Chainlink CRE Confidential Workflows | Only mechanism that lets competing lenders pool data without mutual disclosure |
| Subject identity | World ID nullifier → `subjectId` | A credit file must survive wallet rotation, or defaulting costs one new wallet |
| Consent model | ENSv2 subname + Enhanced Access Control | Time-boxed lender read access = onchain analogue of a credit pull authorization |
| Exposure disclosure | Buckets only, never exact | Exact figures would leak a competitor's book size |
| Database | Postgres | Financial data is relational; auditors expect an RDBMS |
| API framework | Hono | Lightweight, fast, native OpenAPI, no cold starts |

---

## 7. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| CRE learning curve (Go + TEE) | **Critical** | Spike in WS-1 before anything else; hard go/no-go gate at T-014 |
| Cold start — a registry with no furnishers is worthless | High | Subgraph seeds from real mainnet protocols on day one; inquiry velocity works with zero furnished data |
| TEE trust assumption (Intel/AMD attestation) | Medium | State it explicitly in docs and video; do not oversell as trustless |
| Sybil — World ID proves personhood, not entity identity | Medium | Document as a known gap; institutional KYB is out of scope for v1 |
| Cross-chain complexity (Sepolia + Hedera) | Medium | Hedera scope is strictly metering + logging; no protocol state lives there |
| Regulatory framing | Low | Position as lender infrastructure, not a consumer credit bureau (FCRA) |

---

## 8. Submission Compliance (Non-Negotiable)

These are disqualification risks, not formalities.

- **Commit history.** Frequent, incremental commits from event start. A repo with large single commits
  and no history is disqualified by default.
- **No pre-existing code.** Net-new track. Boilerplate and public libraries only.
- **AI usage.** AI tooling may assist but not author the project. If spec-driven workflows are used,
  **all spec files, prompts, and planning artifacts must be committed to the submission repo** —
  including these five `.md` files.
- **Partner prizes: maximum 3 selections.** A partner with multiple tracks counts as one selection.
- **Demo video: 2–4 minutes**, required, featured on the Showcase.
- **Per-partner artifacts.** Architecture diagrams, written feedback, and integration explanations are
  required by several partners. Tracked in `plan.md` WS-9.

---

## 9. Out of Scope for v1

Explicitly not building — say so in the docs rather than half-building:

- Institutional KYB / entity verification
- Debt collection or recovery
- Loan origination or servicing (we are not a lender)
- Credit scoring as a numeric score (we report exposure and velocity, not a FICO analogue)
- Mainnet deployment
- Token or governance

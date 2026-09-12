# Hardpull: Project Specification

## 1. Project Vision

Hardpull is the **furnishing layer** for onchain credit: a confidential exposure registry that lets
competing lenders share the one fact each of them needs and none of them will disclose — how much a
borrower already owes, right now, to someone else.

Existing onchain credit infrastructure builds better scoring models on public data. Hardpull builds
the data layer underneath them.

---

## 2. Problem Statement

- **Stacking is undetectable.** A borrower can originate simultaneous undercollateralized loans across
  several lenders within minutes. Each lender underwrites a borrower who appears unencumbered.
- **Private credit is invisible.** Maple's curated pools, Wildcat, OTC desks, and prop-desk borrowing
  never appear on a public chain. Public-data scoring models cannot see any of it.
- **Lenders will not share books.** Loan book data reveals customer lists, pricing, and concentration.
  No competitor will hand it over, which is why no shared registry exists.
- **There is no inquiry record.** In traditional credit, a borrower shopping eight lenders in a week is
  a distress signal. Onchain, that pattern is invisible to everyone.
- **Defaulting costs one new wallet.** Without a personhood binding, any address-based credit history
  is trivially discarded.

---

## 3. Solution Overview

1. **Furnishers** contribute position records. Public protocols are ingested automatically via a
   normalized subgraph. Private lenders submit encrypted records; only commitments go onchain.
2. **The join happens inside a TEE.** A Chainlink CRE Confidential Workflow aggregates a subject's
   exposure across every furnisher and emits only a verdict.
3. **Pullers** receive an exposure bucket, inquiry velocity, and a stacking flag — never a
   counterparty name, an exact amount, or a term sheet.
4. **Reciprocity is enforced onchain.** Pull allowance scales with what you furnish. Freeloaders are
   rate-limited and repriced.
5. **Inquiries are themselves a signal.** Pull velocity detects stacking *in progress*, before any
   loan closes — and works with zero furnished data, which solves cold start.

---

## 4. Key Entities

### 4.1 The Subject (borrower)
- **Identity:** `subjectId = keccak256(worldIdNullifierHash ‖ "hardpull.v1")`
- **Roles:** binds wallets to a subject, grants and revokes lender consent, views own inquiry history.
- **Incentive:** a portable credit file that carries positive repayment history across lenders, and
  visibility into who has pulled on them.

### 4.2 The Furnisher (lender contributing data)
- **Roles:** submits encrypted position records; updates status on repayment, default, or closure.
- **Incentive:** furnishing standing unlocks pull allowance. Contribution is the price of access.

### 4.3 The Puller (lender requesting a verdict)
- **Roles:** submits a pull request with a valid consent token and x402 payment.
- **Incentive:** avoids originating into an already-stacked borrower.
- **Note:** in practice every participant is both furnisher and puller. The roles are separated
  because reciprocity is measured between them.

### 4.4 The Underwriting Agent
- **Roles:** an autonomous agent that calls `/v1/pull` as part of a credit decision, paying per
  inquiry via x402 with no API key provisioning.
- **Incentive:** machine-speed underwriting without human credential management.

---

## 5. Technical Requirements

### 5.1 Blockchain Layer
- **Ethereum Sepolia:** `SubjectRegistry`, `FurnisherRegistry`, `ExposureCommitments`,
  `ReciprocityLedger`, `VerdictAttestations`. Solidity 0.8.24, Foundry, OpenZeppelin.
- **Hedera Testnet:** x402 payment settlement for pulls; HCS topic for the immutable inquiry log.
- **ENSv2 (Sepolia):** `hardpull.eth` parent registry; lender subnames; Enhanced Access Control for
  time-boxed consent grants.

### 5.2 Confidential Compute Layer
- **Chainlink CRE Confidential Workflow**, written in Go.
- Holds the workflow keypair. Furnished records are encrypted to its public key.
- Emits a signed verdict payload. Plaintext records never leave the enclave.

### 5.3 Data Layer
- **The Graph:** normalized cross-protocol subgraph (Aave v3, Morpho Blue, Maple on mainnet;
  Hardpull contracts on Sepolia).
- **Postgres (Supabase):** subjects, furnishers, consent grants, inquiries, verdicts, ciphertext blobs.
- **Redis (Upstash):** idempotency keys, rate limits, pull allowance counters.

### 5.4 Application Layer
- **API:** TypeScript, Hono, OpenAPI 3.1, Zod validation.
- **MCP server:** natural-language credit file queries over the subgraph.
- **Console:** Next.js 15, wagmi, viem.

### 5.5 Identity Layer
- **World ID Selfie Check** for subject personhood binding.
- **ERC-8004** identity records for agent-borrowers (stretch).

---

## 6. Functional Requirements

### 6.1 Subject Binding
1. Subject completes World ID verification. API receives the nullifier hash.
2. `subjectId` is derived and registered in `SubjectRegistry`.
3. Subject signs a message from each wallet to bind it to the `subjectId`.
4. One subject may bind many wallets. One wallet binds to exactly one subject.
5. Rebinding a wallet to a different subject is rejected.

### 6.2 Furnishing
1. Furnisher registers, receives `client_id` / `client_secret`, and is recorded in `FurnisherRegistry`.
2. Furnisher encrypts a position record to the CRE workflow public key:
   ```
   { subjectId, principal, currency, originatedAt, maturityAt, status, furnisherId, nonce }
   ```
3. `POST /v1/furnish` stores the ciphertext and writes
   `commitment = keccak256(ciphertext)` plus `furnisherId` and timestamp to `ExposureCommitments`.
4. Status transitions: `ACTIVE → REPAID | DEFAULTED | CLOSED`. Each transition is a new record version.
5. Public protocol positions are ingested by the subgraph and require no furnisher action.

### 6.3 Consent
1. Subject grants a puller time-boxed read access via an ENSv2 Enhanced Access Control grant.
2. Grant carries: `pullerId`, `expiresAt`, `maxPulls`, `purpose`.
3. Subject may revoke at any time. Revocation emits a `consent.revoked` webhook.
4. A pull without a valid, unexpired, unexhausted grant is rejected before any compute occurs.

### 6.4 The Pull (core flow)
1. Puller calls `POST /v1/pull` with `{ subjectId, proposedPrincipal, currency, consentToken }`,
   an `Idempotency-Key` header, and an x402 payment.
2. API validates, in order: authentication → idempotency → consent grant → reciprocity standing →
   x402 payment receipt. Any failure short-circuits before compute.
3. API invokes the CRE workflow with the subject's ciphertext set and subgraph-derived public exposure.
4. Inside the TEE the workflow computes and returns:
   ```json
   {
     "verdict": "CLEAR | WARNING | CRITICAL | INSUFFICIENT_DATA",
     "exposureBucket": "<10k | 10k-50k | 50k-250k | 250k-1M | >1M",
     "originationVelocity48h": 2,
     "inquiryVelocity7d": 5,
     "distinctFurnishers": 3,
     "stackingFlags": ["MULTI_ORIGINATION_48H", "INQUIRY_BURST"],
     "computedAt": "2026-09-14T10:32:00Z",
     "attestation": "0x…"
   }
   ```
5. The inquiry is written to the HCS topic and to `VerdictAttestations`.
6. Response returns to the puller. The inquiry itself becomes an input to all future verdicts.

### 6.5 Stacking Rules (v1 — deterministic and explainable)

Deliberately rule-based, not ML. A lender must be able to see why a verdict fired.

| Verdict | Condition |
|---|---|
| `CRITICAL` | ≥2 originations in 48h from distinct furnishers, **or** `proposedPrincipal + totalOutstanding > 3 ×` historical max single exposure |
| `WARNING` | ≥4 inquiries in 7d from distinct pullers, **or** ≥1 origination in 48h, **or** any `DEFAULTED` record in 24 months |
| `CLEAR` | Records exist and no above condition is met |
| `INSUFFICIENT_DATA` | No furnished records, no public positions, and no prior inquiries |

Thresholds are governable parameters, not hardcoded constants.

### 6.6 Disclosure Limits (hard invariants)

The verdict must **never** contain:
- The identity of any furnisher holding a position
- An exact outstanding amount
- Loan terms, rate, maturity, or collateral
- The identity of any prior puller

Violating any of these destroys the product's reason to exist. Enforce with tests, not discipline.

### 6.7 Reciprocity
1. `pullAllowance = BASE_ALLOWANCE + (freshFurnishedRecords × K)`, where "fresh" means updated within 30 days.
2. Non-furnishers are capped at `BASE_ALLOWANCE` pulls per day and pay a higher x402 price per pull.
3. Standing decays: records not updated in 90 days stop counting.
4. Standing is readable onchain from `ReciprocityLedger` — a lender can prove its own contribution.

### 6.8 Webhooks
Events: `stacking.detected`, `consent.granted`, `consent.revoked`, `subject.default_reported`,
`standing.changed`. Signed with `Hardpull-Signature` (HMAC-SHA256 of the raw body). Retried with
exponential backoff for 24h.

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Pull latency (p95) | < 8s end to end, including CRE round trip |
| API read latency (p95) | < 150ms (Postgres mirror, never direct chain reads on hot paths) |
| Idempotency window | 24h |
| Reconciliation | Hourly job comparing Postgres to onchain commitments; drift alerts |
| Audit | Every pull appears in the HCS log within 30s |
| Availability of demo | Console, API, and both demo lender apps live and publicly reachable at submission |

---

## 8. Success Criteria

The submission succeeds if a judge can, unaided:

1. Open Lender A's dashboard, originate a loan to a demo subject.
2. Open Lender B's dashboard, attempt a second loan to the same subject.
3. Watch Lender B's underwriting agent pay via x402, call `/v1/pull`, and receive `CRITICAL`.
4. Confirm Lender B's response contains no reference whatsoever to Lender A.
5. Open the HCS explorer and see the inquiry logged.
6. Ask the MCP server, in plain English, for the subject's credit file and get a coherent answer.

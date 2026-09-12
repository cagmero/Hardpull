# Hardpull: System Architecture

## 1. High-Level Architecture

Four layers: **On-Chain Protocol**, **Confidential Compute**, **Service Layer**, **Client Interfaces**.

```mermaid
graph TD
    subgraph "On-Chain (Ethereum Sepolia)"
        SR[SubjectRegistry]
        FR[FurnisherRegistry]
        EC[ExposureCommitments]
        RL[ReciprocityLedger]
        VA[VerdictAttestations]
        ENS[ENSv2 Consent Grants]
    end

    subgraph "On-Chain (Hedera Testnet)"
        X402[x402 Facilitator]
        HCS[HCS Inquiry Topic]
    end

    subgraph "Confidential Compute"
        CRE[Chainlink CRE Workflow - TEE]
    end

    subgraph "Data Layer"
        SG[Hardpull Subgraph]
        PG[(Postgres)]
        RD[(Redis)]
    end

    subgraph "Service Layer"
        API[Hardpull API - Hono]
        MCP[Subgraph MCP Server]
    end

    subgraph "Clients"
        LC[Lender Console]
        BV[Borrower File Viewer]
        DA[Demo Lenders A and B]
        AG[Underwriting Agent]
    end

    DA -->|1. furnish ciphertext| API
    API -->|2. write commitment| EC
    DA -->|3. pull request| API
    AG -->|3b. pull request| API
    API -->|4. verify grant| ENS
    API -->|5. check standing| RL
    API -->|6. settle payment| X402
    API -->|7. invoke with ciphertext| CRE
    SG -->|8. public exposure| CRE
    CRE -->|9. signed verdict| API
    API -->|10. write attestation| VA
    API -->|11. log inquiry| HCS
    API -->|12. verdict| DA
    API --> PG
    API --> RD
    MCP --> SG
    LC --> API
    BV --> API
```

---

## 2. Component Details

### 2.1 Smart Contracts (Solidity 0.8.24, Foundry)

| Contract | Responsibility |
|---|---|
| `SubjectRegistry` | Maps `worldIdNullifierHash → subjectId`; binds wallets to subjects. Rejects rebinding. |
| `FurnisherRegistry` | Registers lenders, stores their ENS subname and public key, manages active/suspended state. |
| `ExposureCommitments` | Append-only `(subjectId, furnisherId, commitment, version, timestamp)`. Never plaintext. |
| `ReciprocityLedger` | Tracks fresh furnished-record counts per furnisher; computes `pullAllowance`; decays stale contributions. |
| `VerdictAttestations` | Stores the signed verdict hash, CRE attestation, and inquiry ID. Publicly re-verifiable. |

**Design constraint:** contracts are deliberately thin. They hold commitments, standing, and
attestations. All computation lives in the TEE; all plaintext lives in encrypted blobs off-chain.

### 2.2 Chainlink CRE Confidential Workflow (Go)

The only component that ever sees plaintext positions.

```
INPUT
  subjectId
  proposedPrincipal, currency
  ciphertextSet[]        (encrypted furnished records for this subject)
  publicExposure[]       (from subgraph, already public — no encryption)
  inquiryHistory[]       (from HCS / Postgres mirror)
  thresholds             (governable parameters)

STEPS
  1. Decrypt ciphertextSet with workflow private key
  2. Verify each record's commitment matches ExposureCommitments on-chain
  3. Aggregate totalOutstanding across private + public records
  4. Compute originationVelocity48h, inquiryVelocity7d, distinctFurnishers
  5. Apply stacking rules (spec.md §6.5)
  6. Bucket exposure; discard all per-lender detail
  7. Sign the verdict payload

OUTPUT
  verdict, exposureBucket, velocities, stackingFlags, attestation
```

**Invariant:** the output struct is a fixed shape with no furnisher-identifying fields. This is
enforced at the type level in Go, not by convention.

### 2.3 The Service Layer (`hardpull-api`)

Stateless Hono service. Never decrypts anything — it moves ciphertext.

Middleware chain, in order:
```
request-id → OAuth2 bearer validation → HMAC signature verification
→ IP allowlist → idempotency check → rate limit → route handler
```

Pull handler short-circuit order (fail fast, before paying for compute):
```
1. Idempotency hit?           → return cached response
2. Valid consent grant?       → else 403 CONSENT_MISSING
3. Sufficient standing?       → else 402 RECIPROCITY_INSUFFICIENT
4. Valid x402 receipt?        → else 402 PAYMENT_REQUIRED
5. Invoke CRE
6. Persist + attest + log
```

### 2.4 Subgraph (`hardpull-subgraph`)

The normalized schema is the contribution. One shape across three heterogeneous lending protocols.

```graphql
type CreditPosition @entity {
  id: ID!
  subject: Subject!
  protocol: Protocol!          # AAVE_V3 | MORPHO_BLUE | MAPLE | HARDPULL_FURNISHED
  principal: BigInt!
  currency: Bytes!
  collateralValue: BigInt      # null for uncollateralized
  originatedAt: BigInt!
  maturityAt: BigInt
  status: PositionStatus!      # ACTIVE | REPAID | DEFAULTED | LIQUIDATED | CLOSED
  isPublic: Boolean!
}

type Subject @entity {
  id: ID!                      # subjectId
  wallets: [Bytes!]!
  positions: [CreditPosition!]! @derivedFrom(field: "subject")
  inquiries: [Inquiry!]! @derivedFrom(field: "subject")
  firstSeenAt: BigInt!
}

type Inquiry @entity {
  id: ID!
  subject: Subject!
  pullerHash: Bytes!           # hashed — puller identity is never exposed
  verdict: String!
  occurredAt: BigInt!
}

type Furnisher @entity {
  id: ID!
  ensName: String
  freshRecordCount: Int!
  pullAllowance: Int!
  standingUpdatedAt: BigInt!
}
```

Mapping handlers normalize Aave `Borrow`/`Repay`/`LiquidationCall`, Morpho `Borrow`/`Repay`/`Liquidate`,
and Maple loan events into this single shape.

### 2.5 MCP Server (`hardpull-mcp`)

Tools exposed:
- `get_credit_file(subjectId)` — aggregated file, disclosure limits applied
- `check_stacking_risk(subjectId, proposedPrincipal)` — verdict preview
- `list_recent_inquiries(subjectId, days)` — inquiry velocity detail
- `get_furnisher_standing(furnisherId)` — reciprocity position

Ships with a SKILL describing when an underwriting agent should consult the bureau.

---

## 3. Data Strategy

### 3.1 What lives where

| Data | Location | Why |
|---|---|---|
| Position plaintext | Encrypted blob in Postgres | Only the TEE can read it |
| Position commitment | `ExposureCommitments` (Sepolia) | Tamper-evidence; TEE verifies ciphertext matches |
| Public positions | Subgraph | Already public; no encryption needed |
| Consent grants | ENSv2 EAC (Sepolia) | Borrower-controlled, revocable, independently verifiable |
| Inquiry log | HCS topic (Hedera) | Immutable audit trail; bureaus must log every inquiry |
| Verdict attestation | `VerdictAttestations` (Sepolia) | Re-verifiable after the fact |
| Hot reads | Postgres mirror | Chain reads are 100–500ms; API needs 1–5ms |

### 3.2 Chain as source of truth, Postgres as cache

Subgraph and event listeners write to Postgres. The API reads Postgres on hot paths. An hourly
reconciliation job compares Postgres commitment counts and standing values to onchain state and
raises an alert on drift. Every diligence conversation asks how you know the mirror is correct — this
is the answer.

### 3.3 Encryption scheme

- CRE workflow holds an X25519 keypair. Public key published in `FurnisherRegistry`.
- Furnisher encrypts each record with an ephemeral key (libsodium sealed box).
- `commitment = keccak256(ciphertext)` written onchain at furnish time.
- TEE recomputes the commitment after decryption and rejects any mismatch.

---

## 4. Interaction Flows

### 4.1 Furnishing a position

```mermaid
sequenceDiagram
    participant L as Lender
    participant A as Hardpull API
    participant P as Postgres
    participant C as ExposureCommitments

    L->>A: POST /v1/furnish (sealed box, Idempotency-Key)
    A->>A: verify auth + HMAC + idempotency
    A->>P: store ciphertext, return recordId
    A->>C: writeCommitment(subjectId, furnisherId, keccak256(ct))
    C-->>A: txHash
    A->>P: update standing counters
    A-->>L: 201 { recordId, commitment, txHash }
```

### 4.2 The pull (core flow)

```mermaid
sequenceDiagram
    participant B as Lender B Agent
    participant A as Hardpull API
    participant E as ENSv2
    participant X as x402 (Hedera)
    participant R as CRE Workflow (TEE)
    participant G as Subgraph
    participant H as HCS

    B->>A: POST /v1/pull { subjectId, proposedPrincipal }
    A-->>B: 402 Payment Required (x402 challenge)
    B->>X: settle payment
    B->>A: retry with payment receipt
    A->>E: validate consent grant
    A->>A: check reciprocity standing
    A->>X: verify receipt
    A->>G: fetch public exposure
    A->>R: invoke { ciphertextSet, publicExposure, inquiryHistory }
    R->>R: decrypt, verify commitments, aggregate, apply rules, bucket
    R-->>A: signed verdict (no furnisher detail)
    A->>H: log inquiry
    A-->>B: 200 { verdict: CRITICAL, stackingFlags: [...] }
```

### 4.3 Consent grant and revocation

```mermaid
sequenceDiagram
    participant S as Subject
    participant V as File Viewer
    participant E as ENSv2 EAC

    S->>V: grant access to Lender B, 30 days, 3 pulls
    V->>E: setAccess(subjectNode, lenderB, expiry, maxPulls)
    E-->>V: txHash
    Note over S,E: later
    S->>V: revoke
    V->>E: clearAccess(subjectNode, lenderB)
    Note over E: subsequent pulls fail at step 2, before compute
```

---

## 5. Failure Modes and Handling

| Failure | Handling |
|---|---|
| CRE workflow unavailable | Return `503`, do **not** charge; queue retry; never return a stale verdict |
| Commitment mismatch in TEE | Reject that record, mark furnisher record `TAMPERED`, continue with remaining records, include `DATA_INTEGRITY_WARNING` in the verdict |
| Consent expires mid-flight | Validated before compute only; in-flight requests complete |
| x402 payment succeeds but CRE fails | Idempotency key holds the receipt; retry consumes no second payment |
| Subgraph lag | Verdict includes `dataFreshnessSeconds`; stale beyond threshold downgrades `CLEAR` to `INSUFFICIENT_DATA` |
| Duplicate pull (network retry) | Idempotency key returns cached verdict; no second inquiry logged |

---

## 6. Security Model and Its Limits

**What Hardpull guarantees**
- No lender learns another lender's positions, counterparties, or terms.
- Every inquiry is immutably logged and independently auditable.
- Commitments prevent a furnisher from retroactively altering a submitted record.
- A borrower controls which lenders may read their file, and can revoke.

**What Hardpull does not guarantee — state these plainly in the docs and the video**
- TEE integrity relies on hardware attestation (Intel/AMD). This is a trust assumption, not a proof.
- World ID establishes personhood, not institutional identity. Entity-level Sybil resistance is out of scope for v1.
- A determined furnisher can submit false records. Commitments make them tamper-evident, not true.
- Exposure buckets leak coarse information by design; they are a deliberate trade against full opacity.

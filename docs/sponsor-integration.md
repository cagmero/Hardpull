# Hardpull: Sponsor Integration Strategy

> **Reference doc.** Read alongside `plan.md` WS-9. Verify every requirement below against the live
> prizes page before submitting — partner requirements change without notice.

---

## 1. The Hard Constraint

**A submission may select a maximum of three partner prizes.** A partner with multiple tracks counts
as a single selection, and you are eligible for all of that partner's tracks.

This is the single most important planning fact. Breadth is impossible; depth is the only strategy.

---

## 2. Selection: Hedera · The Graph · Chainlink

| Partner | Tracks reachable | Why selected |
|---|---|---|
| **Hedera** | x402 Agentic Payments, Tokenization, Harness | Largest reachable pool through one selection. A credit pull is the most legitimate x402 service imaginable — bureaus charge per inquiry by nature. HCS provides the audit log a bureau is structurally required to keep. |
| **The Graph** | Composable/Standardized, AI Tooling | The normalized cross-protocol schema *is* the public-furnisher ingestion layer. Without it there is no data. The MCP server is a genuine AI surface, not a wrapper. |
| **Chainlink** | Confidential Workflow, Liquidation Protection Challenge | The confidential join is the product's spine. Two payable slots, high technical barrier, few competing submissions. Lower prize value but materially higher win probability. |

### Why not the others

- **Arc** — more prize value than Chainlink, looser fit. Hardpull does not settle loans. Swap Chainlink → Arc only if T-014 fails.
- **Privy / ENS / World** — built anyway (T-070, T-071) because the product is incoherent without them, but not submitted. Unsubmitted integrations still strengthen the finalist case.
- **1inch / Uniswap** — no honest fit. Do not manufacture one.

---

## 3. Per-Partner Requirements

### 3.1 Hedera

**What we build**
- `/v1/pull` gated by x402 on Hedera Testnet; HTTP 402 challenge, receipt verification, replay protection (T-060)
- Differential pricing by reciprocity standing (T-061)
- HCS topic carrying every inquiry as an immutable audit record (T-062)
- An underwriting agent that pays and pulls autonomously, with no API key provisioning (T-063)

**Why it is load-bearing:** without x402 there is no metering model for a per-inquiry service, and no
way for an autonomous underwriting agent to transact without human credential setup. Without HCS there
is no tamper-evident inquiry log — and an inquiry log a bureau can silently edit is worthless.

**Their stated gap:** x402 has rails but few real services to pay for. A credit pull is a real service
with a real price and a real buyer. Say this explicitly in the write-up.

**Checklist**
- [ ] Architecture diagram included
- [ ] Metered per-call, not flat-rate or subscription
- [ ] Agent demonstrably transacts without human intervention
- [ ] HCS topic ID published and explorer-linked

### 3.2 The Graph

**What we build**
- One normalized `CreditPosition` schema across Aave v3, Morpho Blue, and Maple (T-030…T-033)
- Hardpull contract indexing on Sepolia (T-034)
- Published subgraph consumed by the CRE workflow and the API (T-035)
- MCP server + SKILL exposing four credit-file tools (T-083)

**Why it is load-bearing:** public-protocol exposure is half the verdict input. A single-protocol query
would produce a blind verdict. The normalization across three heterogeneous protocols is the
contribution.

**Their explicit exclusion:** querying one subgraph does not qualify. Lead the write-up with what the
shared schema *made easier* — one query shape replacing three protocol-specific integrations — and
attach the T-036 evidence.

**Checklist**
- [ ] Live data from a Graph provider with a Subgraph Studio API key
- [ ] Composability demonstrated, not just consumption
- [ ] "What became easier" write-up attached
- [ ] MCP server functional against the live subgraph

### 3.3 Chainlink

**What we build**
- Confidential Workflow performing the cross-lender join inside a TEE (T-040…T-044)
- In-enclave commitment verification against on-chain state (T-041)
- Type-level output stripping so no furnisher identity can escape (T-042)
- Liquidation Protection Challenge: call `join()` on their Sepolia contract (near-free, do it)

**Why it is load-bearing:** remove the TEE and competing lenders will not contribute data, because
contributing means disclosing a loan book to a rival. The product does not exist without it. This is
the strongest possible framing and it happens to be true.

**Their explicit exclusion:** a placeholder handler or isolated example that does not contribute will
not qualify. The workflow is the core compute path — make that unmissable.

**Checklist**
- [ ] Workflow deployed and invoked by the live API
- [ ] Confidentiality demonstrated, not asserted — show that plaintext never leaves
- [ ] `join()` called for the separate challenge
- [ ] TEE trust assumption stated honestly

---

## 4. Built But Not Submitted

Include these in the video and docs. They make the product coherent and strengthen the finalist case,
and they cost nothing at submission time.

| Integration | Task | Role |
|---|---|---|
| World ID Selfie Check | T-070 | Personhood floor. Without it, defaulting costs one new wallet and the whole file is worthless. |
| ENSv2 Enhanced Access Control | T-071 | Borrower consent grants — the onchain analogue of a credit pull authorization. |
| ERC-8004 | T-072 | Agent-borrower identity. Stretch only. |

---

## 5. Anti-Patterns

Every partner at this event has written an explicit disqualification clause. They have all been burned
by prize-driven integrations and are actively screening for them.

**Do not:**
- Add a partner's tech to a component that does not need it
- Submit a partner prize for an integration you would delete if the prize vanished
- Describe an integration in marketing language instead of naming the specific failure mode without it
- Skip the feedback artifacts — several partners treat them as a gate, not a nicety

**Test for each selection:** name the exact thing that breaks if this integration is removed. If the
answer is "nothing, it would still work," do not submit that partner.

---

## 6. Submission Checklist

- [ ] Exactly three partner prizes selected
- [ ] Per-partner integration write-up naming a concrete failure mode (T-092)
- [ ] Per-partner feedback artifact delivered in the required form (T-093)
- [ ] Architecture diagrams attached (T-091)
- [ ] Demo video 2–4 minutes, live deployments, no mocked data (T-094)
- [ ] All repos public with incremental commit history
- [ ] Spec files, prompts, and planning artifacts committed — including these five `.md` files
- [ ] Live URLs reachable by a stranger with only the submission link
- [ ] Requirements re-verified against the live prizes page on submission day

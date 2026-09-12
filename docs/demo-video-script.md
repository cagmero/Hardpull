# Demo Video Script (2:30–3:30 target)

Structure follows `docs/plan.md` T-094. Every step below references a page/command that actually
exists and was exercised live during development — this is a recording guide, not aspirational
copy. **Before recording**, complete the setup checklist at the bottom: several steps need a
funded Hedera testnet account, a deployed CRE workflow, and a deployed subgraph, none of which
exist yet in this environment (see `docs/DECISIONS.md` and each package's README for exactly
what's pending).

---

### 1. The stacking problem (0:00–0:25)

Voiceover over a simple diagram (use `docs/architecture.md`'s Mermaid diagram, rendered):

> "A borrower draws $50,000 from Lender A. Twelve minutes later, the same borrower draws $50,000
> from Lender B — undercollateralized, on a different protocol. Neither lender can see the
> other's book. This is loan stacking, and onchain it's structurally worse than in traditional
> credit: origination is instant, permissionless, and until now, there's been no inquiry record
> anywhere. Hardpull is the furnishing layer that fixes that — without any lender disclosing
> their book to a competitor."

### 2. Lender A originates (0:25–0:45)

Screen: `demo-lenders/lender-a` (port 3002), already registered (localStorage credentials from a
prior run — register live once beforehand so this segment is just the origination).

- Enter the demo subject's `subjectId`.
- Click "Originate loan" ($50,000).
- Show the trace log scrolling: sealing the record, furnishing, real onchain tx hash.

> "Lender A originates $50,000 to this borrower. The position is sealed to the CRE enclave's
> public key before it ever leaves Lender A's browser — Hardpull's own API never sees the
> plaintext."

### 3. Lender B's agent pays, pulls, declines (0:45–1:25)

Screen: `demo-lenders/lender-b` (port 3003).

- Enter the same `subjectId`, propose $50,000.
- Click "Run underwriting agent."
- Narrate the trace as it appears: agent registers itself, gets a token, pays the x402 challenge,
  calls `/v1/pull`, receives `CRITICAL`.

> "Lender B's underwriting agent does this with no human in the loop — it pays for the pull
> itself, in HBAR, over x402, and calls the same endpoint any lender would. It gets back
> `CRITICAL`, with a `MULTI_ORIGINATION_48H` flag."

### 4. Proof Lender B learned nothing about Lender A (1:25–1:55)

Screen: the JSON verdict response, full-screen, scrolled slowly.

> "Look at exactly what came back: a verdict, an exposure bucket, a flag. No mention of Lender A.
> No mention of which protocol, which lender, or the exact amount outstanding. That's not a
> redaction step — the CRE enclave's output type has no field for any of that. We wrote a test
> that fails the build the moment anyone adds one."

(Optional: briefly show `cre/workflow/types.go`'s `Verdict` struct and
`TestVerdict_NeverExposesRestrictedFields` passing.)

### 5. HCS log and MCP query (1:55–2:25)

Screen split: Hedera testnet explorer showing the HCS topic with this inquiry's message, then a
terminal running the MCP server answering a natural-language question.

> "Every inquiry — regardless of verdict — is logged to Hedera Consensus Service, immutably. And
> because the exposure data is normalized across Aave, Morpho, and Maple into one schema, an
> underwriting agent can just ask: 'what's this borrower's recent inquiry history?' — and get a
> real answer sourced from the subgraph and the API, live."

### 6. Limits, stated honestly (2:25–2:40)

Plain text on screen, read aloud, no music:

> "Three things we want to be direct about: the TEE's confidentiality guarantee rests on hardware
> attestation — that's a trust assumption, not a mathematical proof. World ID proves personhood,
> not institutional identity, so entity-level Sybil resistance is out of scope for this version.
> And exposure buckets deliberately leak coarse information by design — full opacity would make
> the registry useless for its actual purpose."

---

## Setup checklist before recording

- [ ] `SEPOLIA_RPC_URL` + funded `DEPLOYER_PRIVATE_KEY`, contracts deployed via
      `contracts/script/Deploy.s.sol` (real Sepolia, not Anvil)
- [ ] Subgraph deployed to Studio for both manifests, `SUBGRAPH_URL`/`SUBGRAPH_SEPOLIA_URL` set
- [ ] Chainlink CRE account (`cre login`), workflow deployed, `CRE_WORKFLOW_URL` set
- [ ] Funded Hedera testnet operator account, HCS topic created
      (`api/src/scripts/create-hcs-topic.ts`), `HEDERA_HCS_TOPIC_ID` set
- [ ] A reachable x402 facilitator with a funded signer for `hedera:testnet`
- [ ] A demo subject registered (World ID or the `cast send registerSubject` path documented in
      `api/README.md`), with Lender B's agent identity granted consent via the console file page
- [ ] Run the full scenario once, unrecorded, per `docs/plan.md` T-090's "three consecutive clean
      runs" gate, before recording for real

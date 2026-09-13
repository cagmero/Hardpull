# Demo Video Script (2:30–3:30 target)

Structure follows `docs/plan.md` T-094. Every step below references a page or command that
actually exists and was exercised live — this is a recording guide, not aspirational copy.

The whole narrative already runs end to end locally and is asserted by
`api/src/scripts/e2e-scenario.ts` (3/3 clean runs). **Recording it for real still needs the
external accounts** in the checklist at the bottom — and two of them are not optional for
honesty, not merely for polish:

- **Never record with `HARDPULL_X402_MODE=disabled`.** It skips payment entirely. Segment 3's
  claim that the agent "pays for the pull itself" is false in that mode, and `/health/ready`
  would say `BYPASSED` on camera.
- **Never record against `cre/cmd/localgateway`.** It runs the same handler code, but there is no
  enclave and no attestation. Segment 4's confidentiality claim requires a deployed Confidential
  Workflow. (If deploy access hasn't come through by recording day, the honest substitute is to
  show `cre workflow simulate` producing the signed verdict and say plainly that the workflow is
  simulated pending private-beta enrolment — that is a far better look than implying otherwise.)

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

(Optional, and strong: show `cre/workflow/types.go`'s `Verdict` struct, then run
`go test ./hardpull/...` and point at
`TestOnPullRequest_NeverLeaksPlaintextOrFurnisherIdentity` passing — it runs the real handler
inside the SDK's TEE runtime and asserts the plaintext principal, the furnisher id, the prior
puller id and both private keys appear in neither the verdict nor any enclave log.)

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
- [ ] Chainlink CRE **deploy access** (`cre account access` — Confidential Workflows is private
      beta; simulation already works without it), workflow deployed, `CRE_GATEWAY_URL` +
      `CRE_WORKFLOW_ID` set and `HARDPULL_X402_MODE` **unset**
- [ ] Funded Hedera testnet operator account, HCS topic created
      (`api/src/scripts/create-hcs-topic.ts`), `HEDERA_HCS_TOPIC_ID` set
- [ ] A reachable x402 facilitator with a funded signer for `hedera:testnet`
- [ ] `cd cre && go run ./cmd/keygen` run **before** deploying contracts — `creSigner` is
      immutable, and the workflow public key must reach `api/.env` and both front-ends
      (`node scripts/sync-deployments.mjs` does the fan-out)
- [ ] A demo subject registered (World ID, or
      `pnpm --filter @hardpull/api exec tsx src/scripts/seed-demo-subject.ts`), with Lender B's
      agent identity granted consent via the console file page — note the returned `grantId`,
      which is the `consentToken` Lender B must paste in
- [ ] `curl $API/health/ready` shows every dependency configured and `payment: enforced` —
      this is the single check that proves nothing is bypassed
- [ ] `pnpm --filter @hardpull/api exec tsx src/scripts/e2e-scenario.ts --runs 3` passes 3/3
      against the *deployed* stack, per T-090, before recording for real

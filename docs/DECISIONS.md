# Decisions Log

Dated record of go/no-go and architecture decisions made during the build. Append, never rewrite
history.

## Format

```
## YYYY-MM-DD — <decision title>
**Context:** why this decision was needed
**Decision:** what was decided
**Rationale:** why
```

---

<!-- Entries below this line. The T-014 CRE viability gate (docs/plan.md WS-1) is the first
     required entry — record it here once the spike (T-010..T-013) completes. -->

## 2026-09-12 — T-014 CRE viability gate: provisionally GO, full simulation still pending

**Context:** T-014 requires T-011 (confidential input roundtrip), T-012 (HTTP fetch from
workflow), and T-013 (verdict signing) to all pass before committing to CRE as the confidential
join, per `plan.md` WS-1.

**Decision:** Proceed with CRE (do not activate the T-015 fallback yet), but the gate is not
fully closed. What's actually verified:
- The real, public `cre-sdk-go` (v1.19.0) and `capabilities/networking/http` (v1.3.0) modules
  were pulled and inspected directly (`go doc`) rather than assumed from memory.
- A full confidential workflow (`cre/main.go`) compiles successfully to a genuine WASM binary
  (`GOOS=wasip1 GOARCH=wasm go build`) using `cre.HandlerInTee`, `http.Trigger`,
  `runtime.GetSecret`, matching the documented Confidential Workflows model.
- The business logic inside it (stacking rules, commitment verification, sealed-box
  encrypt/decrypt) is independently unit-tested and correct on its own.

**What's not yet verified (why this isn't a full GO):** `cre workflow simulate` and
`cre workflow deploy` both require `cre login` — an authenticated Chainlink CRE account this
build environment does not have. T-011/T-012/T-013 as literally specified ("simulated locally")
have not run. The code is a strong, real-SDK-verified best effort, not a simulated pass.

**Rationale:** Compiling against the actual SDK (not a guessed API) and getting a genuine WASM
artifact out the other end is the strongest signal available without account access. Falling
back to T-015 (threshold encryption / trusted-operator model) would throw away a working
confidential-compute path over an access gap, not a technical one. Revisit this entry the moment
CRE account access exists — running the real simulation is the next action, not a redesign.

## 2026-09-13 — Full build pass complete; status of every workstream

**Context:** end-to-end implementation pass across all nine components in one continuous session,
following `plan.md`'s workstream breakdown. Recording final status here since it spans every
workstream rather than one gate.

**What's genuinely verified (run live, not just built or unit-tested):**
- `contracts/`: 36 Foundry tests, including a 10,000-run fuzz test for the disclosure invariant
  (T-027). Deployed to a local Anvil node and exercised via `cast send`/`cast call`.
- `cre/`: compiles to real WASM against the actual `cre-sdk-go`. Sealed-box encryption proven
  byte-for-byte interoperable with the TypeScript twin via `cre/cmd/interop`, both directions,
  real keypair.
- `subgraph/`: both manifests (`mainnet`, `sepolia`) build to WASM against real `graph-cli`.
  Every event signature checked against each protocol's real source on GitHub. Corrected two
  design assumptions this way: Maple has no fixed loan address (needs the factory/template
  pattern), and Morpho's `Borrow` event indexes different parameters than initially assumed.
- `api/`: the full `/v1/pull` short-circuit chain (auth → idempotency → consent → standing →
  x402 → compute) run live against Postgres + Redis + Anvil. Caught and fixed two real bugs this
  way, not found by unit tests alone:
  1. `FurnisherRegistry.register()` bound `operatorToFurnisher[msg.sender]`, but the API is
     always the transaction sender (furnishers relay through it). The first registration
     permanently occupied that slot, so a second furnisher could never register. Fixed by making
     the contract registrar-gated with an explicit `operator` parameter, matching
     `SubjectRegistry`'s existing pattern.
  2. `POST /v1/consent` was gated behind furnisher OAuth2 bearer auth, but granting consent is a
     *subject* (borrower) action per `spec.md` §6.3, not a furnisher action. Replaced with
     wallet-signature auth verified against the `wallets` table.
- `console/`, `demo-lenders/`: functional pages verified against the live stack, including the
  full narrative — Lender A furnishes, a subject grants consent via a real wallet signature,
  Lender B's autonomous agent registers itself, gets a token, and correctly reports
  `CONSENT_MISSING` or `PAYMENT_SYSTEM_UNAVAILABLE` at exactly the right boundary.
- `mcp/`: all four tools registered, confirmed live over a real stdio JSON-RPC handshake.

**What's explicitly not verified, and why:** anything gated on an external account this
environment doesn't have --- a Chainlink CRE login (blocks `cre workflow simulate`/`deploy`), a
funded Hedera testnet account (blocks x402 settlement and HCS logging), a Subgraph Studio API key
(blocks live subgraph deployment), a registered World ID Developer Portal app (blocks live proof
verification). Each of these fails at the API layer with a specific, typed error rather than a
generic failure or a silent no-op -- confirmed by triggering each one live during this session.

**Decision:** ship this as the Net-New submission base. The remaining work is entirely
account/deployment provisioning (create the accounts, run the deploy scripts already written and
tested against Anvil, point env vars at the results) rather than further engineering -- no
component needs a redesign to go live.

**Rationale:** every external-dependency boundary was hit and handled deliberately (a typed
error naming the missing dependency), not discovered as a surprise. The two real bugs found
during live verification (the FurnisherRegistry msg.sender issue and the consent-auth model)
would not have been caught by unit tests in isolation -- both only surfaced by actually running
the full chain against a live stack, which is why that verification style was used throughout
rather than stopping at "it compiles."


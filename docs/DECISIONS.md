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

## 2026-09-13 — Second pass: closed every code-only gap from the prior entry

**Context:** the prior entry's "known gaps" list mixed two different kinds of item: things that
needed more code, and things that needed an external account. This pass closed every item in the
first category; what's left is entirely the second.

**What changed:**
- **x402 settlement ordering** — re-examined and found the code was already correct
  (`requireX402Payment` gates `processSettlement` on `c.res.status < 400`); the prior write-up
  overstated the risk. Comment in `pull.ts` corrected to describe the real, much smaller residual
  edge case (settlement failing *after* a successful 200 has already been returned).
- **Reconciliation drift math** — was comparing a Postgres proxy count directly against
  `ReciprocityLedger`'s computed `pullAllowance`. Fixed to call the contract's own
  `freshRecordCount()`/`versionCount()` views directly. Verified live by injecting both a
  standing-count drift and a commitment-version drift straight into Postgres and confirming the
  job detects each and exits non-zero, with a clean run left undisturbed.
- **Webhook retry durability** — replaced the in-process `setTimeout` chain (couldn't survive a
  restart, only spanned ~1h) with a persisted `webhook_deliveries` queue and a worker script.
  Verified live against a real HTTP receiver: successful delivery with a cryptographically
  confirmed HMAC signature, and a failed delivery correctly incrementing `attempt_count` and
  scheduling `next_attempt_at`.
- **ENSv2 Enhanced Access Control** — implemented for real against the actual
  `IEnhancedAccessControl.sol` interface (verified from `ensdomains/contracts-v2` source).
  Surfaced a genuine prerequisite: `grantRoles` reverts unless the caller already admins the
  target resource, and a resource only gets an admin once something is registered against it --
  so this needs `hardpull.eth` registered on Sepolia plus a subname minted per subject before it
  does anything beyond skip gracefully. Same category of dependency as a funded Hedera account.
- **CRE workflow request signing** — implemented as a verified port of the real CRE TypeScript
  SDK's JWT-signing client (fetched and checked line-by-line from
  `smartcontractkit/cre-sdk-typescript`). A test confirms the signature genuinely recovers to the
  signing key's address.
- **World ID console widget** — added, deliberately pinned to `@worldcoin/idkit@2.4.2` rather
  than latest: the latest major version ships a different World ID 4.0 protocol
  (`rp_context`, presets, a different result shape) that the backend's cloud-verify call doesn't
  implement. 2.4.2's result shape matches exactly.
- **Console standing dashboard** — added, backed by a new public `GET
  /v1/furnishers/:id/standing` endpoint reading live from `ReciprocityLedger`/`FurnisherRegistry`
  (spec.md #6.7.4 explicitly calls for standing to be independently verifiable onchain).
- **OpenAPI spec + SDK codegen (T-05B)** — `api/openapi.yaml` written, `sdk-node` rewritten on
  `openapi-typescript` + `openapi-fetch` instead of hand-typed. Verified live: the generated
  client's `getStanding()`/`getInquiries()` both returned real data from the running API.

**What's still pending, and it is now entirely external provisioning, not code:** a Chainlink CRE
account (blocks simulating/deploying the workflow and confirming the JWT digest scheme matches
byte-for-byte), a funded Hedera testnet account and reachable x402 facilitator (blocks payment
settlement and HCS logging), a Subgraph Studio deployment, a registered World ID Developer Portal
app, and `hardpull.eth` registered on Sepolia with per-subject subnames minted (blocks the EAC
mirror writes actually succeeding). None of these need a redesign -- every integration is written
and gated behind a clear, typed error when its prerequisite is missing.



## 2026-09-13 — T-014 gate CLOSED for real: the confidential workflow was simulated

**Context:** the 2026-09-12 entry recorded T-014 as "provisionally GO", because
`cre workflow simulate` needs an authenticated Chainlink CRE account and the build environment
was believed not to have one. That belief was wrong: the CRE CLI was installed at `~/.cre/bin/cre`
and already logged in (`cre whoami` returns an account with `Deploy Access: Not enabled`). Per
Chainlink's own documentation, private-beta enrolment gates **deployment only** — local
development and simulation work without it.

**Decision:** T-014 is now a full GO, on evidence rather than inference. `cre workflow simulate`
ran the real confidential workflow and returned, for the two-originations-twelve-minutes-apart
scenario from `spec.md` #8:

```
Verdict: CRITICAL   ExposureBucket: 50k-250k   OriginationVelocity48h: 2
StackingFlags: [MULTI_ORIGINATION_48H]   Attestation: 0x3823e9e9…1b
```

**What had to change to get there.** The `cre/` directory was a flat Go module, not a CRE
project. `cre init` (the official `hello-confidential-workflows-go` template, used as the
structural reference) expects a project root holding `project.yaml` and `secrets.yaml`, with the
workflow in its own subdirectory alongside `workflow.yaml` and per-target config. `cre/` now
matches that: the workflow lives in `cre/hardpull/`, and `cre/workflow/` remains the pure-Go
rules package.

The more consequential change: `main.go`, `wire.go` and `signing.go` were **all** tagged
`//go:build wasip1`, so the confidential handler could not be compiled — let alone tested — on
the host. Only `main.go` needs that tag. Splitting it out made `onPullRequest` reachable from
`go test`, and the SDK ships `cre/testutils.NewTeeRuntime`, a real TEE runtime harness. There
are now ten tests exercising the actual handler end to end, including the two the gate is
really about:

- `TestOnPullRequest_NeverLeaksPlaintextOrFurnisherIdentity` — T-011 stated literally
  ("plaintext never appears in any log or return value"): seals a record, runs the handler,
  and asserts that neither the returned verdict nor anything in `runtime.GetLogs()` contains the
  plaintext principal, the furnisher id, a prior puller id, or either private key.
- `TestOnPullRequest_AttestationRecoversToSignerAddress` — T-013: `ecrecover` over the exact
  signed bytes returns the signer's address.

### Two real bugs that only surfaced by running it

**1. The CRE runtime ignores `json` tags.** The simulator serializes a handler's return value
using Go *field names*. `signedVerdict` embedded `workflow.Verdict`, so the response came back as
nested `{"Verdict":{"Verdict":"CRITICAL",…}}` — not the flat camelCase body
`api/src/lib/creClient.ts` parses. Fixed on both sides: the struct is now flat with every field
spelled out, and `creClient.ts` accepts either casing. Left unfixed, every deployed-workflow pull
would have read as `undefined` and degraded to a false `INSUFFICIENT_DATA`.

**2. Every `VerdictAttestations.attest()` call reverted `InvalidSignature()`.** The enclave signs
`keccak256(json.Marshal(workflow.Verdict))`. The API was hashing `JSON.stringify(signedVerdict)`
— a different byte string, including the attestation itself. `ecrecover` therefore returned some
other address and the contract rejected it. Nothing failed loudly, because the attestation write
is deliberately best-effort: the pull still returned 200, and the audit trail simply never got
written. On Sepolia this would have produced a demo where "publicly re-verifiable attestations"
were silently absent from the chain.

The fix is structural rather than a matching re-serialization: the workflow now publishes
`canonicalPayload`, the exact bytes it signed, and the API hashes those. Re-deriving a signed
payload across a language boundary is the failure mode; not doing it is the fix. Verified on a
local Anvil deployment — `VerdictAttestations.verify()` returns `true` and a `VerdictAttested`
event is on-chain. `api/src/lib/__tests__/attestation.test.ts` pins both the correct behavior and
the broken one.

**Rationale for recording this at length:** both bugs sat in code that compiled, passed unit
tests, and was described in the previous entry as verified. Neither was reachable without running
the real thing. That is the entire argument for the verification style this project has used, and
it held.

**Still pending, and genuinely external:** deploy access (`cre account access`) for Confidential
Workflows, which is private beta. Simulation needed none of it.

## 2026-09-13 — T-090 gate automated and passing; closed the remaining code-only gaps

**Context:** the prior pass left a set of items that needed code rather than an external account.
This closes them, and turns `spec.md` #8 from a checklist into an executable gate.

**T-090 is now a script, not a ritual.** `api/src/scripts/e2e-scenario.ts` runs the full success
criteria and asserts each one — three consecutive clean runs, no manual intervention, which is
the gate's literal wording. It currently passes 3/3, covering: subject binding, three independent
lenders, two furnished originations, the consent gate refusing an ungranted pull, a wallet-signed
grant, **a second lender being refused when it presents another lender's token**, the `CRITICAL`
verdict with `MULTI_ORIGINATION_48H`, the disclosure invariant asserted against the actual
response body, idempotent replay logging no second inquiry, the borrower's inquiry log with the
puller hashed, a real pull through the generated `@hardpull/sdk-node` (T-05B's acceptance
criterion), and revocation taking effect on the next pull.

**Gaps closed:**

- **`consentToken` was decorative.** It was required by the schema, the OpenAPI spec and every
  client, and then never checked — callers passed the literal strings `"agent"`, `"mcp"` and
  `"demo"`. It is now the `grantId` from `POST /v1/consent` and must name a live, unexpired,
  unrevoked, unexhausted grant belonging to *both* this subject and this authenticated puller.
  Consent is consequently no longer transferable between lenders, which it silently was.
- **`standing.changed` never fired.** Declared in `spec.md` #6.8, in the OpenAPI enum and in the
  subscription validator, with no dispatch site anywhere. It now fires on furnish and on status
  transitions, carrying the recomputed on-chain allowance.
- **The workflow key and the furnisher identity key were the same placeholder.** Both demo
  lenders and the console used one constant, named `WORKFLOW_PUBLIC_KEY_HEX`, both as the key
  records are sealed to *and* as the furnisher's own `FurnisherRegistry` identity — set to
  `3333…`, `4444…` and `1111…` respectively. These are different keys with different owners.
  Sealing now uses the real workflow key from env (no default: a wrong one yields ciphertext the
  enclave cannot open, which would fail silently), and each lender generates its own identity
  keypair at registration.
- **The IP allowlist in `architecture.md` #2.3's middleware chain did not exist.** Implemented
  with CIDR support, and deliberately ignoring `X-Forwarded-For` unless `TRUST_PROXY=true` —
  that header is caller-supplied, and trusting it by default would let anyone forge an allowed
  source. Unset means allow-all, which is right for the demo and is reported rather than assumed.
- **`GET /health/ready`** now reports which integrations are configured and reachable, and what
  each gate of `/v1/pull` will actually do right now. Every dependency being individually
  optional is good design, but it made "what works at this moment?" unanswerable from outside.

**Two tools that make the demo runnable before the accounts exist**, both deliberately
conspicuous:

- `cre/cmd/localgateway` serves the *same* handler code over HTTP in the shape `creClient.ts`
  speaks. It is not a mock — it imports the identical packages, so the rules cannot drift — and
  it is not a TEE: it prints `NOT A TEE` on startup and sees every plaintext it decrypts. It
  proves the plumbing and the rules. Confidentiality is what `cre workflow simulate` shows.
- `HARDPULL_X402_MODE=disabled` skips the payment gate for local rehearsal. Off unless set,
  logs a warning on every request, and `GET /health/ready` reports payment as `BYPASSED`. It
  exists so the chain can be exercised without a funded Hedera account; **no demo or deployment
  may run in this mode**, and the readiness endpoint is what proves one didn't.

**Other corrections:**

- `cre/cmd/keygen` generates both keypairs, writes them to a gitignored `.env` at 0600 without
  ever printing them, and prints only the public values. It also surfaced a real ordering trap:
  `VerdictAttestations.creSigner` is `immutable`, so the attestation key must exist *before*
  `forge script Deploy`, or the contract has to be redeployed.
- `Deploy.s.sol` writes `docs/deployments.<chainId>.json` instead of one shared file, so a local
  Anvil run cannot overwrite or be mistaken for the Sepolia deployment. `scripts/sync-deployments.mjs`
  fans those addresses into every package's env file and into the Sepolia subgraph manifest.
- **Subgraph placeholder addresses replaced with verified ones.** Aave v3 Pool and Morpho Blue
  were each confirmed by calling a method only the real contract could answer
  (`ADDRESSES_PROVIDER()` returning Aave's canonical provider; Morpho's `DOMAIN_SEPARATOR()`),
  and their start blocks found by binary-searching an archive node for the first block with code
  — 16291127 and 18883124. For Maple the registry lists two fixed-term loan factories; the V1
  address reports `defaultVersion() == 0` (retired) while V2 reports 601 under the same
  `mapleGlobals`, so the manifest uses V2 at block 18777478. Maple remains the least-verified of
  the three: the address and ABI are confirmed, but no `InstanceDeployed` event was observed in
  the block windows sampled, so origination coverage is unproven until the subgraph is deployed.
- **CI now covers console, both demo lenders, the MCP server, the SDK, the shared types package
  and both subgraph manifests.** Previously only `api`, `contracts` and `cre` had any workflow at
  all — a type error in the console would have reached the demo rather than a pull request.

**What remains is external provisioning only**, unchanged in kind from the previous entry:
CRE deploy access, a funded Hedera testnet account plus a reachable x402 facilitator, a Subgraph
Studio deployment, a World ID Developer Portal app, and `hardpull.eth` on Sepolia for the ENSv2
EAC mirror.

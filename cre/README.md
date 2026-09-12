# hardpull-cre

Chainlink CRE Confidential Workflow — the confidential join. The only component that ever sees
plaintext position data.

**Highest schedule risk in the project** (`docs/plan.md` WS-1, gate T-014). Status as of this
commit: the workflow builds successfully against the real, public `cre-sdk-go` and compiles to a
genuine WASM binary. It has **not** been run through `cre workflow simulate` or deployed, because
both require an authenticated Chainlink CRE account (`cre login`) that only you can provide.
Everything below states plainly what's verified and what isn't.

## What's real here

This is not a mockup against an imagined API — every type and function below was confirmed
against the actual `github.com/smartcontractkit/cre-sdk-go` source (v1.19.0) and its
`capabilities/networking/http` submodule (v1.3.0), both public Go modules:

- `workflow/` — pure Go, no CRE dependency, fully unit-tested (`go test ./workflow/...`):
  - `rules.go` — the deterministic stacking rules from `docs/spec.md` #6.5, with 21 table-driven
    cases covering every branch and boundary (T-040's ≥20-case requirement)
  - `commitment.go` — commitment verification (T-041): recomputes `keccak256(ciphertext)` and
    rejects mismatches without failing the whole batch
  - `sealedbox.go` — a real implementation of libsodium's `crypto_box_seal` (X25519 + XSalsa20-
    Poly1305 + BLAKE2b nonce derivation), matching `docs/architecture.md` #3.3's encryption
    scheme exactly. Round-trip, wrong-key, and tampered-ciphertext cases are all tested.
  - `types.go` — `Verdict` has no field for furnisher identity, exact principal, rate, maturity,
    or prior puller identity (T-042). `TestVerdict_NeverExposesRestrictedFields` inspects the
    struct via reflection and fails the build if anyone ever adds one.
- `main.go`, `wire.go`, `signing.go` (`//go:build wasip1`) — the actual CRE workflow:
  - `InitWorkflow` registers `cre.HandlerInTee` (confidential execution) on an `http.Trigger`,
    matching `docs.chain.link/cre/concepts/confidential-workflows`
  - `onPullRequest` runs inside the `cre.TeeRuntime`: fetches the workflow's X25519 private key
    via `runtime.GetSecret`, decrypts and verifies each furnished record, merges in the public
    positions and inquiry history the API already fetched from the subgraph, calls
    `workflow.Evaluate`, and signs the result

## What's a deliberate simplification

- **Verdict signing uses a single secp256k1 secret**, not DON-consensus report signing
  (`cre.GenerateReport` / `TeeRuntime.ReportFromDon`, verified onchain via a Keystone Forwarder
  contract). Real production CRE workflows use the latter; verifying it requires a live CRE
  deployment with a deployed Forwarder, which needs the same account access blocking simulation
  below. `VerdictAttestations.sol` recovers a single signer address via standard `ecrecover`
  instead — an explicit, documented scope reduction, not a silent shortcut.
- **The workflow doesn't fetch the subgraph itself.** `docs/architecture.md` #2.2 lists
  `publicExposure[]` as an *input* the API already retrieved, not something the workflow fetches
  over HTTP inside the TEE — so the `networking/http` capability here is used only for the
  trigger, not an outbound fetch. (T-012's "HTTP fetch from workflow" spike task is a separate,
  smaller proof of that capability, not part of this production path.)

## What genuinely needs your action before this can run for real

1. **A Chainlink CRE account.** `cre login` is required for `cre workflow simulate` and
   `cre workflow deploy` — I cannot create or authenticate one.
2. **The CRE CLI itself**, installed per
   [docs.chain.link/cre/getting-started/cli-installation](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux).
3. Once logged in: `cre workflow simulate` against `config.example.json` (rename/fill in real
   values), which is the actual T-011/T-012/T-013 spike this workstream's gate (T-014) depends on.

## Local build (works today, no CRE account needed)

```bash
go test ./workflow/...                        # pure business logic, no CRE runtime required
GOOS=wasip1 GOARCH=wasm go build -o workflow.wasm .   # compiles the real workflow to WASM
GOOS=wasip1 GOARCH=wasm go vet .
```

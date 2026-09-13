# hardpull-cre

Chainlink CRE Confidential Workflow — the confidential join. The only component that ever sees
plaintext position data.

**Status: T-014 gate CLOSED.** `cre workflow simulate` runs the real workflow and returns a
signed `CRITICAL` verdict for the stacking scenario in `docs/spec.md` #8. See
`docs/DECISIONS.md` for the full record, including the two bugs that only surfaced by running it.
What is still outstanding is **deploy access** (`cre account access`) — Confidential Workflows is
in private beta, and enrolment gates deployment only, not simulation.

## Layout

This is a CRE project, laid out the way `cre init` generates one:

```
cre/
├── project.yaml              # RPC targets per environment
├── secrets.yaml              # secret id -> env var mapping
├── .env                      # the secret values (gitignored, written by cmd/keygen)
├── hardpull/                 # the workflow
│   ├── main.go               # //go:build wasip1 -- the WASM entry point, and ONLY this
│   ├── workflow.go           # Config, onPullRequest (the TEE handler), InitWorkflow
│   ├── wire.go               # JSON DTOs for the HTTP trigger
│   ├── signing.go            # verdict signing for VerdictAttestations.sol
│   ├── workflow_test.go      # handler tests against cre/testutils' TeeRuntime
│   ├── workflow.yaml
│   └── config.{staging,production}.json
├── workflow/                 # pure Go rules package -- no CRE dependency, runs anywhere
└── cmd/
    ├── keygen/               # generates both keypairs
    ├── localgateway/         # serves the handler over HTTP for local end-to-end runs
    └── interop/              # proves the Go and TypeScript sealed-box implementations match
```

Only `main.go` carries the `wasip1` build tag. Everything else builds on the host too — which is
what makes the confidential handler itself unit-testable rather than only the rules underneath it.

## Setup

```bash
cd cre
go run ./cmd/keygen        # writes .env (0600); prints ONLY the public values
```

It prints two things you need elsewhere:

- the **workflow X25519 public key** — furnishers seal records to it
  (`CRE_WORKFLOW_PUBLIC_KEY_HEX` in `api/.env`, `NEXT_PUBLIC_CRE_WORKFLOW_PUBLIC_KEY_HEX` in the
  console and Lender A).
- the **attestation signer address** — `VerdictAttestations.creSigner`.

That second one is an ordering trap worth knowing: `creSigner` is `immutable`, so **run keygen
before `forge script Deploy`**, or the contract has to be redeployed to match.

## Test and build (no CRE account needed)

```bash
go test ./...                                          # rules + the real TEE handler
go vet ./...
GOOS=wasip1 GOARCH=wasm go build -o workflow.wasm ./hardpull
```

`go build ./...` fails on the `hardpull` package by design — `main()` is WASM-only, exactly as in
Chainlink's own `hello-confidential-workflows-go` template. Use `go vet` and `go test` on the host.

## Simulate (needs a logged-in CRE account, not deploy access)

```bash
cre workflow simulate hardpull \
  --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload '{"subjectId":"0x…","proposedPrincipal":"50000","publicPositions":[…]}'
```

Note the runtime serializes the handler's return value using **Go field names**, ignoring `json`
tags — so the response is `{"Verdict":"CRITICAL",…}`, not camelCase. `api/src/lib/creClient.ts`
normalizes both casings rather than betting on one.

## Local gateway — for end-to-end runs, NOT for confidentiality claims

```bash
go run ./cmd/localgateway     # http://127.0.0.1:8546
```

It runs the **same** handler code (same packages, same rules, same signing), so the business
logic cannot drift from what the enclave does. It is **not a TEE**: no enclave, no attestation,
and the process reads the workflow private key from its own environment and sees every plaintext
it decrypts. It exists so `/v1/pull` can be exercised end to end before deploy access exists.

Never present its output as evidence of the confidentiality property. That is what
`cre workflow simulate` and a deployed Confidential Workflow are for.

## A deliberate simplification

Verdict signing uses a **single secp256k1 key**, not DON-consensus report signing
(`cre.GenerateReport` / `TeeRuntime.ReportFromDon`) verified on-chain through a Keystone
Forwarder. Verifying that path needs a live deployment with a deployed Forwarder, which needs the
same deploy access that is still pending. `VerdictAttestations.sol` recovers a single signer with
standard `ecrecover` instead — a documented scope reduction, not a silent shortcut.

## What the enclave does and does not hide

Worth stating plainly, because it is the most common misconception and the docs and video must
not overclaim: the workflow **binary is not confidential**. It is handed to the enclave by the
Workflow DON, so the logic is visible. What stays confidential is the **data** that logic computes
over — the Vault DON secrets, the decrypted position records, and the intermediate values. That
is precisely the property Hardpull needs: no lender learns another lender's book. It is not the
same as the logic being secret, and nothing here depends on the logic being secret.

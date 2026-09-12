# Chainlink CRE Integration Write-Up

## What we built

A Chainlink CRE Confidential Workflow (`cre/`) that performs the one operation the entire product
depends on: aggregating a subject's exposure across multiple competing lenders' private records
without any of those lenders ever seeing each other's data.

- `cre/main.go` registers a confidential HTTP-triggered handler with `cre.HandlerInTee` — the
  entire callback runs inside a TEE, not on standard Workflow DON nodes.
- Inside the enclave: fetch the workflow's X25519 private key via `runtime.GetSecret`, decrypt
  each furnisher's sealed record, recompute and verify its `keccak256` commitment against what's
  recorded onchain in `ExposureCommitments` (rejecting any tampered record without failing the
  whole batch), merge in the subgraph-sourced public exposure and inquiry history, apply the
  deterministic stacking rules, and sign the result.
- The output type (`workflow.Verdict`) has no field for furnisher identity, exact principal, or
  prior puller identity — enforced by a reflection-based test that fails the build if anyone ever
  adds one, not by code review discipline.
- `cre/cmd/interop` is a small Go CLI built specifically to prove the sealed-box encryption
  scheme is byte-for-byte compatible with the TypeScript implementation furnishers actually use
  (`packages/types/src/sealedbox.ts`) — a message sealed by one was opened correctly by the
  other, in both directions, with a real generated keypair.

## Why it's load-bearing

Remove the TEE and the product doesn't degrade — it stops existing. The entire premise is that
competing lenders will contribute exposure data to a shared registry only if none of them can see
what any other lender contributed. Without confidential compute, "furnishing" is just handing a
competitor your loan book, and no rational lender does that. There is no fallback design in this
codebase that keeps the product's value proposition intact without a TEE (T-015's fallback —
threshold encryption or a trusted-operator model — was scoped as an explicit downgrade, restating
the disclosure guarantee "at the weaker level," not a drop-in replacement).

## What's verified vs. what still needs your platform

**Verified in this repo, independently of any CRE account:**
- The workflow was built against the real, public `cre-sdk-go` (confirmed via `go doc` against
  the actual v1.19.0 source, not assumed from memory) and its `capabilities/networking/http`
  submodule (v1.3.0).
- It compiles to a genuine WASM binary: `GOOS=wasip1 GOARCH=wasm go build`.
- The business logic inside it — the stacking rules, commitment verification, sealed-box
  encrypt/decrypt — is independently unit-tested (21 table-driven cases for the rules alone) and
  passes.

**Not yet verified — needs a Chainlink CRE account:**
- `cre workflow simulate` and `cre workflow deploy` both require `cre login`, which this build
  environment doesn't have. T-011/T-012/T-013 as literally specified ("simulated locally") have
  not run against the real CRE runtime.
- The Liquidation Protection Challenge `join()` call has not been made, for the same reason.

**One explicit, documented simplification:** verdict signing uses a single secp256k1 secret
(fetched via `runtime.GetSecret`) rather than DON-consensus report signing
(`cre.GenerateReport`/`TeeRuntime.ReportFromDon`, verified onchain via a Keystone Forwarder).
Verifying the latter requires a live CRE deployment with a deployed Forwarder — the same account
access gap blocking simulation. `VerdictAttestations.sol` recovers a single signer address via
standard `ecrecover` instead. This is stated here and in `cre/README.md`, not left implicit.

## What breaks if this integration is removed

The confidential join is not an optimization on top of the product — it is the product. Every
other component (contracts, subgraph, API) exists to feed data into or read verdicts out of this
workflow. Remove it, and Hardpull is a database with an API in front of it that no lender would
ever write real data into.

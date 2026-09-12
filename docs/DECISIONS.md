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


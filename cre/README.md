# hardpull-cre

Chainlink CRE Confidential Workflow — the confidential join. The only component that ever sees
plaintext position data.

**Highest schedule risk in the project.** Must be spiked first (`docs/plan.md` WS-1, gate T-014)
before any other workstream that depends on it proceeds.

## Local toolchain (not yet installed on this machine)

- Go 1.22+
- CRE CLI (for `cre workflow simulate`)

## Planned flow (`docs/architecture.md` §2.2)

```
INPUT   subjectId, proposedPrincipal, ciphertextSet[], publicExposure[], inquiryHistory[], thresholds
STEPS   decrypt → verify commitments → aggregate → compute velocities → apply stacking rules
        → bucket exposure → sign verdict
OUTPUT  verdict, exposureBucket, velocities, stackingFlags, attestation
```

**Invariant:** the output struct has no furnisher-identifying fields, enforced at the Go type level
(T-042) — not by convention.

## Layout

- `workflow/` — the CRE workflow implementation (T-040..T-044)

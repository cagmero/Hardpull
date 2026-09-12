# hardpull-demo-lenders

Two mock lender dashboards used solely for the demo video, so the stacking scenario can be shown
from both sides simultaneously (docs/plan.md T-082).

**Status:** verified live end-to-end against a local Anvil + Postgres + Redis stack. Lender A
registers itself, seals a position, and furnishes it with a real onchain commitment write.
Lender B's underwriting agent registers itself autonomously, requests a token, calls `/v1/pull`,
and correctly reports `CONSENT_MISSING` when the subject hasn't granted it access and
`PAYMENT_SYSTEM_UNAVAILABLE` when Hedera x402 isn't configured -- both are the *correct* honest
outcomes for this environment, not bugs.

- `lender-a/` (port 3002) — `cp .env.example .env`, then "Originate loan": registers as a
  furnisher (persisted to `localStorage`) and furnishes a sealed position for a subject.
- `lender-b/` (port 3003) — `cp .env.example .env`, then "Run underwriting agent": a server-side
  Next.js API route (`app/api/agent/route.ts`) that registers its own puller identity in-memory,
  gets a token, calls `/v1/pull`, and decides APPROVE / DECLINE / APPROVE_WITH_REVIEW /
  UNABLE_TO_DECIDE. No human ever handles the agent's credentials — see docs/plan.md T-063.

```bash
pnpm --filter @hardpull/demo-lender-a dev
pnpm --filter @hardpull/demo-lender-b dev
```

## Running the full scenario locally

1. Start `hardpull-api` against a local Anvil node with the contracts deployed (see
   `../contracts/README.md` and `../api/README.md`).
2. On Lender A, originate a loan to a subject you've registered on `SubjectRegistry` (see
   `../api/README.md` for the `cast send registerSubject` flow used to verify this without a
   live World ID app).
3. On the borrower's console file page (`../console`), grant Lender B's agent identity consent
   for that subject — the agent's `furnisherId` is printed in its first run's trace.
4. On Lender B, run the underwriting agent for the same subject. With a real Hedera testnet
   account and a deployed CRE workflow, this returns a real verdict; without them, it reports
   exactly which external dependency is missing.

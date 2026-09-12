# Hedera Integration Write-Up

## What we built

1. **x402 metering on `/v1/pull`** (`api/src/lib/x402.ts`) — a per-call payment gate wired
   against the real `@x402/core` and `@x402/hedera` packages (Coinbase's actual npm packages,
   confirmed against their published type definitions, not guessed). Since no official Hono
   integration exists for `@x402/core`'s framework-agnostic `x402HTTPResourceServer`, we wrote a
   custom `HTTPAdapter` implementation for it. Pricing is differential by reciprocity standing
   (`docs/spec.md` §6.7.2): a furnisher with fresh standing pays `$0.01`/pull, everyone else pays
   `$0.05`, both read live from `ReciprocityLedger.pullAllowance` onchain.
2. **HCS inquiry audit log** (`api/src/lib/hcs.ts`) against `@hiero-ledger/sdk`. Every inquiry is
   submitted as `(inquiryId, subjectIdHash, pullerHash, verdict, timestamp)` — hashed identifiers
   only, no PII, no amounts.
3. **An autonomous underwriting agent** (`demo-lenders/lender-b/app/api/agent/route.ts`) that
   registers its own puller identity, requests an access token, and calls `/v1/pull` with no
   human touching a credential at any point.

## Why it's load-bearing

Without x402 there is no metering model for a per-inquiry service, and no way for an autonomous
agent to transact without a human provisioning it an API key first. Without HCS there is no
tamper-evident inquiry log — and a credit bureau's inquiry log that the bureau itself can silently
edit is worthless as an audit trail; the entire point is that it's independently checkable.

Hedera's own framing is that x402 has rails but needs real services to pay for. A credit pull is
about as real as it gets: bureaus have charged per-inquiry since long before there was a
blockchain to put that on.

## What's verified vs. what still needs your platform

**Verified live, this session, against a local Anvil + Postgres + Redis stack (not just
unit-tested):** the full short-circuit chain up to and including the x402 gate. A pull request
with valid consent and sufficient reciprocity standing correctly reaches
`requireX402Payment` and is correctly blocked there with a clear, typed
`PAYMENT_SYSTEM_UNAVAILABLE` error — the honest result for an environment with no funded Hedera
testnet account and no reachable facilitator, not a bug being papered over.

**Not yet verified — needs a funded Hedera testnet account:**
- Actual x402 settlement (`ExactHederaScheme` requires a facilitator with a funded signer, per
  `@x402/hedera`'s own docs — the facilitator pays gas and submits the transaction).
- HCS topic creation and message submission (`api/src/scripts/create-hcs-topic.ts` is written and
  ready to run the moment `HEDERA_OPERATOR_ACCOUNT_ID`/`HEDERA_OPERATOR_PRIVATE_KEY` exist).
- The underwriting agent settling a real payment — it currently reaches the payment gate
  correctly and reports the exact missing dependency rather than faking success past it.

**A design note surfaced by building this for real:** `docs/architecture.md` §2.2 lists x402
settlement and CRE invocation as sequential steps inside one handler. Our `requireX402Payment`
middleware settles payment in an after-`next()` hook that runs *after* the route handler returns
— so if the CRE call inside the handler fails, settlement isn't correctly sequenced relative to
that failure yet. Flagged in `api/README.md`'s "Known gaps" rather than left silent; the fix is to
invoke CRE before triggering settlement, not after.

## HCS topic ID

Not yet published — topic creation requires the funded operator account above. The script that
creates it is committed and ready (`api/src/scripts/create-hcs-topic.ts`).

# hardpull-api

The bureau API — the product surface institutions integrate against. TypeScript, Hono, Postgres,
Redis, viem, Zod.

**Status:** the full short-circuit chain (auth → idempotency → consent → standing → x402 →
compute) is implemented and was verified end-to-end against a real local stack: Postgres +
Redis in Docker, and a local Anvil node running the actual deployed contracts from
`../contracts`. Furnisher registration, OAuth2 token exchange, HMAC-signed furnish writes,
idempotency replay, and the consent/standing gates all round-tripped real on-chain transactions
and were confirmed correct. What's *not* verified: World ID (needs a registered app), the CRE
workflow call (needs a deployed workflow), x402 settlement (needs a funded Hedera account and a
reachable facilitator), and HCS logging (needs a funded Hedera account). Each of those fails
with a clear, typed error when unconfigured rather than silently no-op'ing.

## Middleware chain

```
request-id → ip-allowlist → rate-limit → [oauth bearer] → [HMAC signature] → idempotency → route
```

`ip-allowlist` is a no-op unless `HARDPULL_IP_ALLOWLIST` is set (comma-separated IPv4 addresses
and CIDRs). It reads `X-Forwarded-For` only when `TRUST_PROXY=true`, because that header is
caller-supplied — trusting it unconditionally would let anyone forge an allowed source address.

`/v1/pull` additionally runs `consent → standing → x402 payment` before the handler, in that
order, so a request is never charged if it was always going to be rejected
(`docs/architecture.md` §2.3).

## Is it actually wired up? `GET /health/ready`

Every external integration is individually optional: the service starts without it and fails with
a specific typed error at exactly the boundary that needs it. That is deliberate, but it makes
"what works right now?" impossible to answer from outside — so this endpoint answers it, listing
each dependency as configured/reachable and stating what each gate of `/v1/pull` will currently
do. `GET /health` stays a bare liveness check for load balancers.

## Local dev

```bash
docker run -d --name hardpull-postgres -e POSTGRES_PASSWORD=hardpull -e POSTGRES_DB=hardpull -p 55432:5432 postgres:16-alpine
docker run -d --name hardpull-redis -p 56379:6379 redis:7-alpine

cp .env.example .env   # then fill in DATABASE_URL/REDIS_URL for the containers above
pnpm --filter @hardpull/api exec node-pg-migrate up -m src/db/migrations

# To exercise the chain-backed routes (furnish, subjects, pull), also run a local Anvil node
# with the contracts deployed -- see ../contracts/README.md "Deploy" -- and point
# SEPOLIA_RPC_URL / *_ADDRESS env vars at it (CHAIN_ID=31337).

pnpm --filter @hardpull/api dev
```

### Running the whole scenario locally

Two switches make the full flow runnable before the external accounts exist. Both are off by
default and both announce themselves, because an unmetered pull against a non-TEE gateway must
never be mistaken for the real thing:

```bash
cd ../cre && go run ./cmd/keygen && go run ./cmd/localgateway   # same handler code, NOT a TEE
# then, for the API:
CRE_GATEWAY_URL=http://127.0.0.1:8546 CRE_WORKFLOW_ID=local HARDPULL_X402_MODE=disabled
```

`HARDPULL_X402_MODE=disabled` skips the payment gate and logs a warning on every request;
`/health/ready` reports payment as `BYPASSED`. Never run a demo or a deployment this way.

Then run the success criteria as an executable gate (`docs/plan.md` T-090):

```bash
pnpm --filter @hardpull/api exec tsx src/scripts/seed-demo-subject.ts   # a subject, sans World ID
pnpm --filter @hardpull/api exec tsx src/scripts/e2e-scenario.ts --runs 3
```

`e2e-scenario.ts` asserts every step of `docs/spec.md` #8 — including that a second lender cannot
reuse another lender's consent token, that the verdict body contains no furnisher identity or
exact amount, that an idempotent replay logs no second inquiry, and that revocation takes effect
on the next pull. Three clean runs is the gate.

## Test

```bash
pnpm --filter @hardpull/api test                 # unit tests only, no external services needed
DATABASE_URL=postgres://postgres:hardpull@localhost:55432/hardpull \
  pnpm --filter @hardpull/api test                # also runs Postgres-backed integration tests
```

## Scheduled jobs

Neither is a long-running daemon — run each on a schedule (cron, or your platform's scheduler)
and let it exit:

```bash
# Every minute: delivers due webhook_deliveries rows, retrying on a schedule spanning ~24h
pnpm --filter @hardpull/api exec tsx src/scripts/deliver-webhooks.ts

# Hourly: compares Postgres to onchain state, exits non-zero on drift (docs/plan.md T-05A)
pnpm --filter @hardpull/api exec tsx src/scripts/reconcile.ts
```

Both were verified live against Anvil + Postgres: `reconcile.ts` correctly detects both a
standing-count drift and a commitment-version drift injected directly into Postgres; the webhook
worker correctly delivers to a real HTTP receiver (with a verified HMAC signature) and correctly
schedules a retry with an incremented `attempt_count` when the receiver is unreachable.

## Known gaps (flagged in code, collected here for visibility)

- **World ID** (`src/lib/worldid.ts`): the real Worldcoin verify endpoint is called correctly,
  but needs `WORLD_ID_APP_ID`/`WORLD_ID_ACTION_ID` from a registered Developer Portal app.
- **CRE workflow request signing** (`src/lib/creJwt.ts`): implemented as a verified port of the
  real CRE TypeScript SDK's client (`cre-sdk-typescript`'s `create-jwt.ts`/`utils.ts`, fetched and
  checked line-by-line, not guessed) — an ECDSA-signed JWT whose payload digest commits to the
  canonical (lexicographically key-sorted) JSON-RPC request body. A test confirms the signature
  genuinely recovers to the signing key's address. What's *not* confirmed: whether the CRE
  gateway's own canonical-JSON digest computation matches `json-stable-stringify`'s output
  byte-for-byte, and the exact response envelope shape (the reference client returns the parsed
  body without unwrapping a `.result` field, so `creClient.ts` handles both shapes defensively).
  Both need a live deployed workflow to actually confirm — see `cre/README.md`.
- **ENSv2 Enhanced Access Control** (`src/lib/ensEac.ts`): the `grantRoles`/`revokeRoles`/
  `hasRoles` calls are real, verified against the actual `IEnhancedAccessControl.sol` interface
  on `github.com/ensdomains/contracts-v2` (not guessed), and wired into `consent.ts` as a
  best-effort onchain mirror alongside the Postgres grant. But `grantRoles` reverts unless the
  caller already admins the target resource, and a resource only gets an admin once something is
  *registered* against it — so this needs `hardpull.eth` (or an equivalent parent name) actually
  registered on Sepolia, and a subname minted per subject, before `ENS_EAC_REGISTRY_ADDRESS`
  does anything beyond skip gracefully. Same category of external dependency as a funded Hedera
  account or a CRE login — confirmed unconfigured behavior doesn't regress anything by testing
  the consent grant flow live with it unset.

x402 settlement ordering (it was already correct — see `src/routes/pull.ts`'s comment),
webhook retry durability (now a persisted queue, `src/scripts/deliver-webhooks.ts`), and
reconciliation drift math (now an exact comparison via `freshRecordCount`/`versionCount`, not a
proxy) were all previously listed here and have since been addressed or corrected — see
`docs/DECISIONS.md`'s entry on this pass.

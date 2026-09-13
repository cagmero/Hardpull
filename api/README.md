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
request-id → rate-limit → [oauth bearer] → [HMAC signature] → idempotency → route
```

`/v1/pull` additionally runs `consent → standing → x402 payment` before the handler, in that
order, so a request is never charged if it was always going to be rejected
(`docs/architecture.md` §2.3).

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
- **CRE workflow request signing** (`src/lib/creClient.ts`): CRE HTTP triggers authenticate
  callers via signed requests against the workflow's `AuthorizedKeys`. Nothing to sign against or
  verify locally without a deployed workflow — see `cre/README.md`.

x402 settlement ordering (it was already correct — see `src/routes/pull.ts`'s comment),
webhook retry durability (now a persisted queue, `src/scripts/deliver-webhooks.ts`), and
reconciliation drift math (now an exact comparison via `freshRecordCount`/`versionCount`, not a
proxy) were all previously listed here and have since been addressed or corrected — see
`docs/DECISIONS.md`'s entry on this pass. ENSv2 Enhanced Access Control is still pending.

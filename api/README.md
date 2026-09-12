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

## Known gaps (flagged in code, collected here for visibility)

- **x402 settlement ordering** (`src/routes/pull.ts`): the x402 payment is settled in
  `requireX402Payment`'s after-`next()` hook, which runs after the route handler returns. If the
  CRE call inside the handler fails, the request has already returned before settlement — so a
  failed CRE call and a failed settlement aren't currently sequenced relative to each other. A
  correct implementation calls the CRE workflow *before* triggering settlement, not after.
- **Webhook retries** (`src/lib/webhooks.ts`) span roughly 1 hour, not the 24h spec.md #6.8
  describes — that needs a durable, persisted retry queue (a job table + a cron worker), not
  in-process `setTimeout` chains.
- **Reconciliation** (`src/scripts/reconcile.ts`) compares a Postgres proxy count to the
  contract's computed `pullAllowance`, not an inverted apples-to-apples value — it needs
  `ReciprocityLedger`'s `K`/`BASE_ALLOWANCE` to translate one into the other correctly.
- **ENSv2 Enhanced Access Control** (`src/routes/consent.ts`): consent grants are Postgres-only
  for now. Wiring in the real ENSv2 EAC contracts is T-071, tracked separately.
- **CRE workflow request signing** (`src/lib/creClient.ts`): CRE HTTP triggers authenticate
  callers via signed requests against the workflow's `AuthorizedKeys`. That signing isn't
  implemented yet — there's no deployed workflow to sign against and verify locally.
- **World ID** (`src/lib/worldid.ts`): the real Worldcoin verify endpoint is called correctly,
  but needs `WORLD_ID_APP_ID`/`WORLD_ID_ACTION_ID` from a registered Developer Portal app.

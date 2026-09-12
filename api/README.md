# hardpull-api

The bureau API — the product surface institutions integrate against. TypeScript, Hono, Postgres
(Supabase), Redis (Upstash), Zod, OpenAPI 3.1.

Never decrypts anything — it moves ciphertext and orchestrates consent checks, reciprocity checks,
x402 settlement, CRE invocation, and attestation writes (`docs/architecture.md` §2.3).

## Middleware chain

```
request-id → OAuth2 bearer → HMAC verification → IP allowlist → idempotency → rate limit → route
```

## Dev

```bash
cp .env.example .env   # fill in Supabase/Upstash/Sepolia/Hedera values
pnpm --filter @hardpull/api dev
curl localhost:3001/health
```

## Layout

- `src/routes/` — route handlers (subjects, furnish, consent, pull, inquiries, webhooks)
- `src/middleware/` — auth, idempotency, rate limiting
- `src/db/` — Postgres schema/migrations (T-051)

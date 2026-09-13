# hardpull-console

Lender console (furnish, pull, standing) + borrower file viewer (inquiries, consent grants).
Next.js 15, wagmi, viem, Tailwind.

## Layout

- `app/verify/` — World ID subject binding (T-070), via `@worldcoin/idkit`
- `app/furnish/` — furnisher position submission (T-080)
- `app/pull/` — pull request form + standing dashboard (T-080)
- `app/file/` — borrower's own credit file, inquiry log, consent management (T-081)

## World ID setup

Pinned to `@worldcoin/idkit@2.4.2` deliberately — the latest major version implements a newer
World ID 4.0 protocol (`rp_context`, preset-based config, a different result shape) that
`api/src/lib/worldid.ts`'s cloud-verify call doesn't implement. 2.4.2's classic
`{proof, merkle_root, nullifier_hash, verification_level}` result is what the backend expects.

Register an app at the [Worldcoin Developer Portal](https://developer.worldcoin.org), then set
`NEXT_PUBLIC_WORLD_ID_APP_ID`/`NEXT_PUBLIC_WORLD_ID_ACTION_ID` here and
`WORLD_ID_APP_ID`/`WORLD_ID_ACTION_ID` in `../api/.env` (same values).

## Dev

```bash
cp .env.example .env.local
pnpm --filter @hardpull/console dev
```

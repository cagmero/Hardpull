# hardpull-console

Lender console (furnish, pull, standing) + borrower file viewer (inquiries, consent grants).
Next.js 15, wagmi, viem, Tailwind.

## Layout

- `app/furnish/` — furnisher position submission (T-080)
- `app/pull/` — pull request form + standing dashboard (T-080)
- `app/file/` — borrower's own credit file, inquiry log, consent management (T-081)

## Dev

```bash
cp .env.example .env.local
pnpm --filter @hardpull/console dev
```

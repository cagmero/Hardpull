# @hardpull/types

Shared TypeScript types and Zod schemas for `Subject`, `PositionRecord`, `PullRequest`, `Verdict`,
`ConsentGrant`, and `FurnisherStanding` (spec.md §4, §6). Imported by `api`, `sdk-node`, `console`,
and `mcp` so the request/response shapes can't drift between services.

## `sealedbox.ts`

The furnisher-side half of the encryption scheme in `docs/architecture.md` §3.3: a TypeScript
implementation of libsodium's `crypto_box_seal` (X25519 + XSalsa20-Poly1305 + BLAKE2b nonce
derivation), matching `cre/workflow/sealedbox.go` byte-for-byte. This is what a furnisher's
browser or Node client encrypts a position record with before calling `POST /v1/furnish` — only
the CRE enclave's Go implementation ever opens it in production.

**Verified interoperable, not just unit-tested in isolation.** `cre/cmd/interop` is a small Go CLI
built specifically to prove this: a message sealed by the Go implementation was opened correctly
by this TypeScript one, and a message sealed here was opened correctly by the Go one, in both
directions, using a real generated keypair. See `cre/cmd/interop/main.go`.

```bash
pnpm --filter @hardpull/types build
pnpm --filter @hardpull/types test
```

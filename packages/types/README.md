# @hardpull/types

Shared TypeScript types and Zod schemas for `Subject`, `PositionRecord`, `PullRequest`, `Verdict`,
`ConsentGrant`, and `FurnisherStanding` (spec.md §4, §6). Imported by `api`, `sdk-node`, `console`,
and `mcp` so the request/response shapes can't drift between services.

```bash
pnpm --filter @hardpull/types build
```

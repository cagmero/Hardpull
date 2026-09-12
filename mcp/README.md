# hardpull-mcp

MCP server so an underwriting agent can query a subject's furnishing activity, inquiry history,
and stacking risk in natural language.

**Status:** all four tools are implemented and verified live over stdio (initialize handshake +
`tools/list` returns all four). The two subgraph-backed tools need a deployed Sepolia subgraph to
return real data; `check_stacking_risk` needs a live Hardpull API + a valid consent grant for
this server's own puller identity (see below) — both fail with a clear error otherwise.

## Tools (`docs/architecture.md` §2.5)

- `get_credit_file(subjectId)` — furnishing activity summary (distinct furnisher count, last
  furnished timestamp, versions) plus recent inquiries. Never an exact amount or identity.
- `check_stacking_risk(subjectId, proposedPrincipal)` — runs a real `/v1/pull` and returns the
  verdict. Requires this server's puller identity to hold a valid consent grant for the subject
  — returning `CONSENT_MISSING` when it doesn't is correct behavior (disclosure enforcement
  applies to AI agents exactly like any other puller), not a bug to route around.
- `list_recent_inquiries(subjectId, days)` — inquiry history from the Hardpull API.
- `get_furnisher_standing(furnisherId)` — reciprocity standing from the Sepolia subgraph.

## Why inquiries come from the API, not the subgraph

`schema.graphql`'s `Inquiry` entity has no handler writing to it: `VerdictAttestations` only
stores an opaque `verdictHash` onchain, not the plaintext verdict level or `pullerHash` a subgraph
mapping would need to populate it. Inquiry history lives in Postgres/HCS instead
(`docs/architecture.md` §3.1), so `list_recent_inquiries` and `get_credit_file` call the Hardpull
API for it rather than querying a subgraph entity nothing ever writes to.

## Setup

```bash
cp .env.example .env
# SUBGRAPH_SEPOLIA_URL, HARDPULL_API_URL, and HARDPULL_CLIENT_ID/SECRET (register this server as
# a furnisher/puller via POST /v1/furnishers the same as any other Hardpull client)
pnpm --filter @hardpull/mcp dev
```

# hardpull-mcp

Subgraph MCP server + SKILL so an underwriting agent can query a credit file in natural language.
Consumes `hardpull-subgraph` via Subgraph MCP.

## Tools (planned — `docs/architecture.md` §2.5)

- `get_credit_file(subjectId)` — aggregated file, disclosure limits applied
- `check_stacking_risk(subjectId, proposedPrincipal)` — verdict preview
- `list_recent_inquiries(subjectId, days)` — inquiry velocity detail
- `get_furnisher_standing(furnisherId)` — reciprocity position

## Dev

```bash
pnpm --filter @hardpull/mcp dev
```

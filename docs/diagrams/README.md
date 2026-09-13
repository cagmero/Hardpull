# Architecture diagrams (T-091)

Rendered from the Mermaid sources in [`../architecture.md`](../architecture.md). Several partners
require an architecture diagram as a submission artifact, and a fenced code block in a Markdown
file is not one — these SVGs are.

| File | What it shows |
|---|---|
| `01-system-architecture.svg` | The four layers and every component, with the numbered call path from furnish through verdict |
| `02-furnishing-flow.svg` | A lender submitting a sealed position record and the commitment landing on-chain |
| `03-pull-flow.svg` | The core flow: consent → standing → x402 → TEE compute → attestation → HCS log |
| `04-consent-flow.svg` | A borrower granting and revoking time-boxed lender access |

The `.mmd` files are the extracted sources. `architecture.md` remains the place to edit a diagram;
re-extract and re-render with:

```bash
node scripts/render-diagrams.mjs
```

That needs no global install — it shells out to `npx @mermaid-js/mermaid-cli`, which downloads a
headless Chromium on first run.

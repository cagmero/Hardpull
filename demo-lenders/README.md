# hardpull-demo-lenders

Two mock lender dashboards used solely for the demo video, so the stacking scenario can be shown
from both sides simultaneously (docs/plan.md T-082).

- `lender-a/` — originates the first loan (port 3002)
- `lender-b/` — its underwriting agent pays via x402 and calls `/v1/pull` on the second loan
  attempt (port 3003)

```bash
pnpm --filter @hardpull/demo-lender-a dev
pnpm --filter @hardpull/demo-lender-b dev
```

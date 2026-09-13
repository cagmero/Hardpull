# hardpull-sdk-node

Typed client for the Hardpull API, generated from `../api/openapi.yaml` via
[openapi-typescript](https://openapi-ts.dev) + [openapi-fetch](https://openapi-ts.dev/openapi-fetch)
(docs/plan.md T-05B) — every request/response is type-checked against the real spec, not
hand-typed.

```ts
import { HardpullClient } from "@hardpull/sdk-node";

const hardpull = new HardpullClient(baseUrl, apiKey);
const verdict = await hardpull.pull({ subjectId, proposedPrincipal, currency, consentToken });
```

**Status:** verified live against the running API — `getStanding()` and `getInquiries()` both
returned real data from a freshly registered furnisher, not mocked responses.

## Build

```bash
pnpm --filter @hardpull/sdk-node build   # runs codegen (regenerates src/generated/openapi.d.ts) then tsc
```

`src/generated/` is gitignored and regenerated from `../api/openapi.yaml` on every build, so it
never drifts from the API's actual contract.

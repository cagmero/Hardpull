# hardpull-sdk-node

Typed client for the Hardpull API.

```ts
import { HardpullClient } from "@hardpull/sdk-node";

const hardpull = new HardpullClient(baseUrl, apiKey);
const verdict = await hardpull.pull({ subjectId, proposedPrincipal, currency, consentToken });
```

Currently hand-written; will be regenerated from `../docs/openapi.yaml` once the API is stable
(T-05B).

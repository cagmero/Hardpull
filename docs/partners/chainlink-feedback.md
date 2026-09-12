# Feedback for Chainlink (CRE)

Genuine friction points from actually integrating `cre-sdk-go` this week, not generic praise.

1. **The multi-module capability layout cost real time to figure out.** `capabilities/scheduler/cron`
   and `capabilities/networking/http` are separate Go modules from the root `cre-sdk-go` module,
   versioned independently (root was at `v1.19.0`; the capability packages we needed were at
   `v1.3.0`). Running `go get github.com/smartcontractkit/cre-sdk-go/capabilities/scheduler/cron@v1.19.0`
   (the root module's version) fails with "module found, but does not contain package" — a
   confusing error that doesn't hint at the actual fix (find that submodule's *own* tag on the Go
   proxy). A short docs note — "capability packages are versioned and tagged independently of the
   SDK root; use `go list -m all` or check `proxy.golang.org/.../@v/list` if `go get` can't find
   the version you expect" — would have saved real debugging time.
2. **Several doc pages we fetched for code examples returned navigation/prose but not the actual
   code** (e.g. the Confidential Workflows concept page's "hands-on steps" section, and the
   Confidential HTTP guide's linked "Making Confidential Requests" sub-page). We ended up
   confirming the real API by installing the package and reading its type definitions directly
   (`go doc`), which worked, but a docs page that promises a code sample should reliably render
   one for any fetch method, not just in an interactive browser with JS-driven tabs/accordions.
3. **No offline way to validate a workflow beyond `go build`.** `cre workflow simulate` requires
   `cre login`, so there's no way to sanity-check a workflow's runtime behavior (trigger wiring,
   secret access, TEE constraint declarations) before creating an account. Even a `--dry-run` mode
   that validates structure without actually executing against the CRE backend would lower the
   barrier to evaluating CRE seriously before committing to the account-creation step.

What worked well: once we had the right package versions, the SDK's actual API
(`cre.HandlerInTee`, `cre.TeeRuntime`, `runtime.GetSecret`) matched its documentation closely, and
the WASM build target (`GOOS=wasip1 GOARCH=wasm`) worked exactly as described on the first try.

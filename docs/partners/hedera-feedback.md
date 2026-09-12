# Feedback for Hedera

1. **`@x402/hedera`'s npm README is genuinely excellent** — installation, client/server/
   facilitator usage, amount units (tinybar vs. HTS decimals), alias policy, token association
   gotchas (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`), and even a live-integration-testing section with
   exact env var names. This is one of the more complete package READMEs we've worked from for a
   fast-moving spec, and it's what let us wire a real, type-correct integration without guessing.
2. **The facilitator-pays-gas model deserves more prominence on the main docs page.** We only
   understood that a Hedera x402 facilitator needs its *own* funded account (distinct from the
   client's) after reading the npm package README closely — `docs.hedera.com/solutions/ai/x402`
   itself is light on this and mostly links out to the spec repo and the package. A sentence like
   "the facilitator, not the client, pays gas and submits the settlement transaction — plan for a
   funded facilitator account separately from your client's" on that landing page would have
   saved us a round trip through the package internals to confirm this.
3. **A copy-pasteable minimal quickstart directly on the docs.hedera.com x402 page** (even just
   the client + server snippets already in the npm README) would reduce the research loop for
   anyone evaluating the integration before installing anything — right now the landing page is
   mostly a pointer to other places rather than a working example.

What worked well: `@hiero-ledger/sdk`'s `TopicCreateTransaction`/`TopicMessageSubmitTransaction`
API for HCS matched our expectations exactly from general Hedera SDK familiarity, no surprises
there.

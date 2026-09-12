# Feedback for The Graph

1. **The `@entity(immutable: ...)` requirement is a good change, but the failure mode for old
   syntax could be gentler for newcomers.** Recent `graph-cli` (0.97.1) now requires an explicit
   `immutable: true|false` argument on every `@entity` directive; a bare `@entity` fails
   `graph codegen` outright. The error message itself was clear and included a fix hint, which is
   good — but a lot of existing tutorials, blog posts, and even older official examples online
   still show bare `@entity`, so this is a landmine for anyone following slightly outdated
   material. A migration note linked directly from that error message (not just the changelog)
   would help.
2. **Discovering that a protocol needs the factory/template pattern currently requires reading
   that protocol's own contracts.** We initially wrote Maple's manifest with a single fixed loan
   address, matching Aave's and Morpho's singleton-contract shape — because nothing in Maple's own
   docs or ours flagged that each Maple loan is a separately deployed proxy. We only caught this
   by reading `maple-labs/maple-proxy-factory` on GitHub directly. The factory/template docs
   pattern itself is well written once you know you need it; what's missing is a signal *before*
   writing the manifest that a given protocol needs it. Something like a short "which pattern does
   my protocol need" checklist, or even a community-maintained list of "known factory-pattern
   protocols" (Maple, and presumably others), would have saved a research detour.
3. **ABI files for well-known protocols aren't bundled or discoverable anywhere in graph-cli
   tooling.** We hand-wrote minimal ABI JSON for Aave v3, Morpho Blue, and Maple containing only
   the events/functions we needed, cross-checked against each protocol's real source. A registry
   or `graph add`-style command that can pull a verified ABI for a well-known contract by name
   or address (Aave v3 Pool, Morpho Blue, etc.) would remove a real source of subtle bugs — a
   hand-transcribed ABI with one wrong `indexed` flag silently produces wrong topic-matching with
   no error at all.

What worked well: `graph codegen`/`graph build` gave fast, accurate compile-time errors for real
mistakes we made along the way (e.g. assigning a `string` where the generated schema expected
`Bytes` for a wallet address) — the AssemblyScript type-checking caught genuine bugs before any
deployment attempt, which is exactly what you want from a codegen step.

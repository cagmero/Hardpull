# Brand — Hardpull

_Status: active_

Derived from the product, not from a questionnaire: Hardpull is credit infrastructure that
competing institutions have to trust with their loan books. It has to read as serious and
inevitable, not as a startup landing page. The reference point is Apple's restraint — a near
neutral canvas, one accent, generous whitespace, and motion you notice only when it's missing.

## Palette

Tokens live in `console/app/globals.css` (and a mirrored subset in each demo lender) as HSL
channel triples, named to shadcn/ui's convention so shadcn components drop in without re-theming.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `0 0% 100%` | `240 12% 5%` | Page canvas |
| `--foreground` | `240 10% 4%` | `0 0% 98%` | Body text |
| `--muted` / `--muted-foreground` | `240 5% 96%` / `240 4% 46%` | `240 6% 13%` / `240 5% 65%` | Secondary surfaces and text |
| `--border` | `240 6% 90%` | `240 6% 17%` | Hairlines |
| `--primary` | `252 83% 57%` | `252 90% 68%` | The one brand accent — violet |

### Semantic colors are reserved

`--clear` (green), `--warning` (amber) and `--critical` (red) exist **only** to carry verdict
severity. Nothing decorative uses them. A bureau that renders `CRITICAL` in the same color as a
nav link has taught the underwriter nothing, so severity color is spent carefully and never
reused for emphasis. Severity is always carried by the word as well as the color, so it survives
colorblindness and a grayscale screenshot.

## Typography

- **Inter** for UI, **JetBrains Mono** for every identifier, amount and timestamp — both via
  `next/font`, self-hosted, so there is no render-blocking request and no flash of fallback text.
- Tight tracking only at display sizes (`-0.03em` at hero, `-0.02em` at title). Loose default
  tracking on a 68px headline is the single clearest tell of an unconsidered typeface setup.
- `font-variant-numeric: tabular-nums` (`.tabular`) anywhere a number can change length. A
  velocity counter going 9 → 10 must not shift the column beside it.

## Gradients

One signature: `.bg-aurora`, three soft radial washes (violet, cyan, magenta at 10–16% alpha) on
the hero and page headers. It is background, never foreground — if it competes with the content
it is turned up too far. `.text-gradient` runs foreground → primary across a display headline,
used once per page at most.

## Motion

Durations come from a fixed vocabulary, never invented per component: **100–120ms** for hover and
focus feedback, **220ms** for element entry, **320ms** for page-level reveals. Entrances use
`ease-out` (decelerate), exits `ease-in` (accelerate). Never `transition: all`; every transition
names its properties. The entire motion layer collapses to instant under
`prefers-reduced-motion: reduce`, and the design is verified to read correctly with motion off.

## Voice

Plain, specific, and willing to say what the product does not do. "No counterparty, no exact
outstanding amount, no loan terms" beats "privacy-preserving by design." The landing page carries
a **What we don't claim** section stating the TEE trust assumption, the personhood-not-identity
limit, and the deliberate coarse leak of exposure buckets — because a credit bureau that oversells
its guarantees is the one thing an institutional reader will not forgive.

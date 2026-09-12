---
name: hardpull-credit-check
description: Consult the Hardpull confidential exposure registry before originating or servicing an undercollateralized onchain loan, to detect loan stacking and check a borrower's furnishing/inquiry history.
---

# When to use this skill

Use the `hardpull-mcp` tools whenever you are about to make an underwriting decision on an
undercollateralized onchain loan and want to know whether the borrower already has undisclosed
exposure elsewhere:

- **Before originating a loan** — call `check_stacking_risk(subjectId, proposedPrincipal)`. A
  `CRITICAL` verdict means the borrower shows signs of simultaneous origination across furnishers
  or an inquiry burst; treat this as a strong decline signal. `WARNING` means proceed with
  caution and manual review. `INSUFFICIENT_DATA` means no furnished, public, or inquiry history
  exists yet — not the same as "clean," just "unknown."
- **When reviewing a borrower's history** — call `get_credit_file(subjectId)` for a summary of
  furnishing activity and recent inquiries, and `list_recent_inquiries(subjectId, days)` to see
  inquiry velocity over a specific window. A high inquiry count in a short window is itself a
  distress signal even before any loan closes.
- **When evaluating a furnisher's own standing** — call `get_furnisher_standing(furnisherId)` to
  see reciprocity standing (pull allowance scales with what a lender furnishes).

# What you will never get back

No tool here ever returns a furnisher's identity, an exact outstanding amount, loan terms, or a
prior puller's identity. If you need those to make a decision, this is the wrong tool — the
entire point of the registry is that no lender discloses that to anyone but the enclave that
computes the aggregate.

# If `check_stacking_risk` returns CONSENT_MISSING

This means the borrower has not granted your puller identity a consent grant for their file. This
is expected and correct — do not attempt to work around it. Ask the borrower to grant consent
through the Hardpull console, or proceed without this check if consent is unavailable.

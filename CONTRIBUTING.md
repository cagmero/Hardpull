# Contributing

This project is judged in part on commit history. Follow these rules without exception:

- **Commit small and often.** One logical change per commit — a contract, an endpoint, a test file,
  a schema change. Never batch a day's work into one commit.
- **Write descriptive messages.** `feat(api): add idempotency middleware`, not `updates`.
  Prefix with the workspace when the change is scoped to one: `contracts:`, `cre:`, `api:`,
  `subgraph:`, `mcp:`, `console:`, `demo-lenders:`, `sdk-node:`, `docs:`, `chore:`.
- **No prior code.** This is a Net-New track submission — every project-specific line is written
  after the event start. Public libraries and boilerplate are fine; nothing is copy-pasted from
  earlier projects.
- **Planning artifacts are committed, not discarded.** Spec files, prompts, and planning docs live
  in `docs/` and are part of the submission, not scratch work.

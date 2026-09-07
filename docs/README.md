# Repository documentation

This convention applies to every change in this repository, including documentation,
configuration, dependencies, generated contracts, and changes made during review.

## Required workflow

1. Read the relevant `docs/adrs/` records before changing their decisions. Keep the
   owning README, setup/deployment guide, and public documentation accurate in the
   same change. Link related repositories when a change crosses their boundaries.
2. Review every change for durable architecture, security, tenancy, public contract,
   storage, deployment, or product decisions. Create or update an ADR when one changes.
   Record already authorized decisions directly; ask only about unresolved choices.
   For changes with no durable decision, state `ADR review: no new decision` and why
   in the update record. Do not create empty ADRs for routine edits.
3. Maintain one update record for the complete change, not one per commit. Before a
   PR number exists, use `docs/updates/pending/<short-slug>.md`. Once a PR is opened,
   rename it to `docs/updates/<actual-pr-number>.md` and fill in its verified PR URL.
   Never guess a PR number or open a PR solely to satisfy this documentation rule.
4. Refresh that same record after implementation, documentation, review, rebase, or
   conflict-resolution changes. Before handing off or marking a PR ready, compare
   the record with the final diff and report any remaining validation or release work.

## Records and templates

- [Architecture decisions](adrs/README.md): `docs/adrs/NNNN-short-slug.md`.
- [Change and PR updates](updates/README.md): `docs/updates/<pr-number>.md`.
- [ADR template](adrs/template.md) and [update template](updates/template.md).

Keep accepted decision history. When a decision changes, update its current text and
append an ISO-8601 timestamped entry under `Updates`, or write a superseding ADR and
link both records. Do not erase previous rationale or amendment entries.

Update records describe the current result, verification, and required consumer or
operator actions. Use the same four sections in every repository: `Intent of the
change`, `Architecture changes`, `Summarized changes`, and `Critical to apply`.
Include a small Mermaid boundary/flow diagram in `Architecture changes`; for a
non-architectural change, show the affected documentation or component boundary and
explicitly say the runtime architecture is unchanged. Start `Critical to apply` with
an exact `yes` or `no` on its own line, then explain why.

Do not claim checks that were not run or treat simulated provider checks as live
verification. Keep secrets, private conversations, raw task transcripts, personal
data, screenshots, generated deployment state, and local configuration out of
these records. Link safe evidence and public contracts instead.

Documentation records complement release notes and generated API documentation;
Changesets, Changie, or other repository release processes still apply. Historical
records keep their original filenames and format; use this convention for new or
actively updated work. Plans and speculative backlogs are not accepted ADRs.

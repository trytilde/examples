---
name: maintain-docs
description: Maintain repository ADRs, change and PR update records, and affected setup/public docs while implementing or reviewing changes.
---

# Maintain repository documentation

Follow [docs/README.md](../../../docs/README.md), the shared documentation contract.
Read governing ADRs before implementation. Write accepted durable decisions in
`docs/adrs/`; amend current text and append timestamped history when they change.
Record already authorized decisions directly and ask only about unresolved choices.

Keep one complete update record using [the template](../../../docs/updates/template.md).
Before a PR exists, use `docs/updates/pending/<short-slug>.md`. After the authorized
PR is opened, rename it to `docs/updates/<actual-pr-number>.md` using the verified
number and URL. Refresh it after each revision; never invent a number or publish
solely to obtain one.

Review affected READMEs, setup/deployment instructions, generated contracts, and
public documentation. Update them in the same change, linking related repository
records and deployment order when applicable. Before handoff, compare the docs with
the complete final diff and report actual validation and remaining work. Missing
or stale required documentation blocks completion. Release notes remain separate.

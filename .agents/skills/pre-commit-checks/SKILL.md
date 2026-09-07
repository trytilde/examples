---
name: pre-commit-checks
description: Validate the affected diff and required documentation before committing or completing a pull request.
---

# Pre-commit checks

## Repository documentation requirements

Follow [docs/README.md](../../../docs/README.md) for every change in this workflow. Create or update
ADRs for resolved durable decisions, keep affected README/setup/public docs current,
and maintain the complete pending or PR-numbered update record after every revision.
Use the shared templates and section names. Missing or stale required documentation
blocks completion. Document already authorized decisions without asking again; ask
only about unresolved choices. These requirements govern documentation instructions
elsewhere in this skill; preserve its repository-specific implementation and checks.

Inspect the complete task diff and preserve unrelated changes. Read the repository
instructions and run checks appropriate to the affected components. Fix in-scope
failures and distinguish pre-existing failures and unavailable external checks.

Follow `maintain-docs` before handoff: review governing ADRs, update durable decisions,
keep affected README/setup/public docs accurate, and refresh the current update
record. A missing or stale required record blocks completion. Check formatting,
links, generated artifacts, release-note obligations, and the final diff. Report
only checks actually run; do not publish or merge without existing authorization.

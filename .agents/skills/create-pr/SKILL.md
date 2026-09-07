---
name: create-pr
description: Prepare or update a pull request with focused validation, current ADRs, and a complete PR update record.
---

# Create or update a pull request

## Repository documentation requirements

Follow [docs/README.md](../../../docs/README.md) for every change in this workflow. Create or update
ADRs for resolved durable decisions, keep affected README/setup/public docs current,
and maintain the complete pending or PR-numbered update record after every revision.
Use the shared templates and section names. Missing or stale required documentation
blocks completion. Document already authorized decisions without asking again; ask
only about unresolved choices. These requirements govern documentation instructions
elsewhere in this skill; preserve its repository-specific implementation and checks.

Inspect the actual base branch, current diff, existing PR, and unrelated workspace
changes. Complete authorized implementation and focused repository checks before
publishing. Follow `pre-commit-checks` and `maintain-docs`; include affected ADRs,
README/setup/public docs, and the pending update record in the reviewed diff.

When publishing is authorized, intentionally stage the task files, commit, push,
and open or update a draft PR. Read its actual number/URL, rename the pending record
to `docs/updates/<number>.md`, update its contents, and push it to the same PR. Link
that record and relevant ADRs/related PRs in the description. Recheck the full diff,
validation, and documentation after later review or rebase changes. Never include
unrelated work, secret values, or unverified claims. Do not merge unless authorized.

# Change and PR updates

Follow [the repository documentation workflow](../README.md). Each change has one
record describing its complete current result, evidence, and deployment impact.
Use [template.md](template.md).

Before a PR exists, keep the record at `pending/<short-slug>.md`. When the authorized
PR is opened, read its actual number and URL from the hosting service, rename the
record to `<pr-number>.md`, and include it in that PR. Never fabricate a number.
Keep updating the same record through review and follow-up commits in the same PR.

Required sections:

1. `Intent of the change`: the concrete problem and resulting behavior.
2. `Architecture changes`: decisions and ADR links, plus a small Mermaid diagram.
   If no durable decision changed, state `ADR review: no new decision` with a reason.
3. `Summarized changes`: affected crates/packages/apps/modules or documentation,
   focused validation actually run, unverified flows, and material outstanding work.
4. `Critical to apply`: begin with exactly `yes` or `no` on its own line, then explain
   deployment order, migration, configuration, API-consumer, or operator actions.

A missing or stale record blocks PR completion. Before handoff, compare it with the
full current diff, link it in the PR description, and ensure required ADRs, READMEs,
setup instructions, and public documentation are included or linked across repos.
Templates, this README, and historical records are not additional records for the
current PR. Keep unrelated history intact.

# Architecture decision records

Follow [the repository documentation workflow](../README.md) for every change.
ADRs record durable decisions and the reasoning a future maintainer needs.

Use the next unused sequential number in `NNNN-short-slug.md`; keep existing IDs
stable. Start from [template.md](template.md), remove instructions, and write concise
normal prose. Include context, the decision, meaningful alternatives/consequences,
and a Mermaid diagram when a relationship benefits from one. Do not add decorative
sections or diagrams.

Record an already approved decision without asking for approval again. Ask only
when the underlying choice is unresolved. If no durable decision changed, explain
that in the change's update record instead of creating an empty ADR.

When amending an ADR, preserve earlier history and append a chronological bullet
under `Updates`: `- YYYY-MM-DDTHH:mm:ssZ: What changed and why.` Use a new ADR when
superseding a decision would otherwise obscure its rationale, and link both records.

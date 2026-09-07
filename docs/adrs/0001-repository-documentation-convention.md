# ADR-0001: Shared repository documentation convention

Status: Accepted

## In brief

- Use `docs/adrs` for durable decisions and `docs/updates` for complete change records.
- Apply the same templates and maintenance requirements across Tilde repositories.

## Context

Repository instructions differed in directory names, templates, and whether changes
required updated records. That made accepted decisions and release obligations easy
to lose between implementation and review.

## Decision

Adopt [the shared documentation workflow](../README.md) as requested on 2026-09-07.
Agents and PR/pre-commit skills must maintain required records as part of the change.
Draft a pending update before a PR exists, then rename it using the actual PR number.
Record decisions already authorized in the task without asking for duplicate approval.

## Consequences

Existing ADR identifiers and amendment history remain intact. References to the old
singular directory are updated. Each repository owns its facts; shared structure does
not mean copying another repository's architecture. Release notes and public guides
remain separate obligations. Supporting indexes/templates and pending change records
are part of the documentation setup.

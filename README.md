# Tilde Agent Examples

Production-oriented examples for building agents with Tilde.

Each top-level folder is an independent project with its own dependencies,
application code, Tilde state, setup guide, and deployment instructions.

| Example | What it demonstrates |
| --- | --- |
| [`hello-world-agent`](./hello-world-agent) | Minimal signed ChatKit agent with Next.js, the Vercel AI SDK, and a Vercel UI channel. |
| [`code-review-bot`](./code-review-bot) | GitHub-triggered pull request reviews with Vercel AI SDK, Tilde MCP, GitHub reverse proxying, and an ephemeral Modal sandbox. |
| [`sentry-remediation-bot`](./sentry-remediation-bot) | Sentry issue signals routed to one per-issue ChatKit session that fixes the repository in Modal, opens a GitHub PR, and links it back to Sentry. |

The examples intentionally keep application code separate. You can copy one
folder without adopting a monorepo or workspace layout.

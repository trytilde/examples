# Sentry Remediation Bot

A Sentry issue-to-pull-request agent built with Tilde Signals, ChatKit, Sentry,
GitHub, Modal, Next.js, and the Vercel AI SDK.

When Sentry raises an `issue.created` webhook, Tilde verifies and normalizes the
payload, routes it through a Signal rule, and invokes this app's ChatKit agent.
The rule keys sessions by Sentry's stable numeric issue ID, so retries and later
messages for the same issue continue the same investigation.

The agent searches Sentry and GitHub for duplicates, reads the issue's events
and stacktrace, uses `git log` and `git blame` in a private Modal checkout,
implements and validates a fix, opens a draft PR, and links that PR back from a
Sentry note. It does not resolve the issue before deployment.

## Setup

1. Run `pnpm install` and copy `.env.example` to `.env.local`.
2. Replace the deployment URL and `REPLACE_WITH_SENTRY_APP_CLIENT_SECRET` in
   `tilde-state.yaml` before importing it. Never commit the real secret.
3. Import state with `tilde state import tilde-state.yaml .tilde/imports/sentry-remediation-output.yaml`.
4. Complete the pending Sentry, GitHub, and Modal credentials in Mission Control.
   The Sentry API token needs `org:read`, `project:read`, `event:read`, and
   `event:write`.
5. Create a Sentry Internal Integration, set its webhook URL to the imported
   Sentry signal provider's `events` URL, and subscribe to `issue.created`.
   The signing key in state must be that integration's client secret.
6. Populate the Vercel environment from `.env.example`. Set
   `GITHUB_REPOSITORY` to the one repository this deployment may change.
7. Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`, then deploy with Vercel.

There is intentionally no `/api/signals` route in this app. Sentry sends its
webhook to Tilde's durable Signals ingress; the only Vercel endpoint is the
signed ChatKit agent route at `/api/sentry-remediation`.

## Security boundary

The model never receives long-lived Sentry, GitHub, or Modal credentials.
Tilde injects them into allowlisted provider calls and reverse proxies. The
repository is fixed by `GITHUB_REPOSITORY`, the Modal sandbox is request-scoped,
and the system prompt prohibits merging or deploying.

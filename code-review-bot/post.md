# Build a Code Review Bot with Vercel AI SDK and Tilde

Code review is a useful test for an agent platform because the model is only
one part of the system. A useful reviewer must receive the right event, inspect
the right commit, understand repository context, run code safely, write to the
correct GitHub lines, and prove that its comments were actually published.

This article builds that system with a small Next.js endpoint, Vercel AI SDK,
Tilde, GitHub, and a five-minute Modal sandbox.

## Start with the trust boundary

The naive architecture gives a model a GitHub token and a shell. That is easy
to prototype and difficult to defend.

Our agent uses a different boundary:

1. GitHub sends an App webhook to Tilde.
2. Tilde converts the event into a signed ChatKit message.
3. The Next.js endpoint verifies the signature and receives validated GitHub
   metadata.
4. Tilde exposes one MCP server containing the GitHub review and Modal
   inspection operations the agent needs.
5. Tilde reverse proxies GitHub Git HTTPS and Modal gRPC, injecting credentials
   after the request leaves the agent.
6. Modal runs untrusted repository checks in an ephemeral sandbox.

The model can inspect code and ask Tilde to post a review. It never sees a
GitHub installation token or Modal API key.

That separation is the main reason the example stays small. Tilde owns
credential setup, OAuth/App handoffs, webhooks, MCP authorization, and reverse
proxying. The Next.js project owns review policy and orchestration.

## Declare integrations as state

The example includes a `tilde-state.yaml` file. It declares the ChatKit agent,
the GitHub and Modal tool providers, and a static MCP server.

The server is deliberately narrow:

```yaml
mcp/server/code-review:
  displayName: Code Review
  isDynamicToolDiscovery: false
  functions:
    - toolName: github_get_pull_request
    - toolName: github_list_pull_request_files
    - toolName: github_create_pull_request_review_comment
    - toolName: github_create_pull_request_review
```

The complete file includes commit, comment, review-history, reply, and pending
review submission operations. It does not include merge, branch, label, file
write, or approval tools.

State creates pending credential items rather than embedding secrets. GitHub
App IDs, private keys, installation IDs, and Modal keys are generated or
entered during a human setup handoff. The resulting reverse-proxy IDs become
deployment configuration.

## Create one Harness client

The application creates one Tilde client and reuses it for ChatKit, MCP, and
reverse-proxy routing:

```ts
import { createClient } from "@trytilde/harness-sdk";

export const tilde = createClient({
  apiKey: env.TILDE_API_KEY,
  baseUrl: env.TILDE_BASE_URL,
  orgId: env.TILDE_ORG_ID,
  orgSubdomain: false,
  teamId: env.TILDE_TEAM_ID,
});
```

That client is constructed outside the route handler and passed directly to
`chatKitEndpoint`. The endpoint verifies Tilde's webhook signature, validates
the ChatKit request body, resolves typed provider metadata, and exposes
session history:

```ts
export const POST = chatKitEndpoint({
  client: tilde,
  webhookSigningKey: env.TILDE_WEBHOOK_SIGNING_KEY,
  async handler(request, context) {
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
    });
    // Run the review.
  },
});
```

Application code does not reimplement webhook parsing, ChatKit schemas,
history pagination, MCP transport, or provider metadata.

## Turn GitHub into a ChatKit message

When someone tags the installed app, Tilde supplies the PR coordinates as
provider metadata:

```ts
type GitHubMetadata = {
  owner: string | null;
  repo: string | null;
  pull_number: number | null;
  comment_id: number | null;
  thread_kind:
    | "pull_request"
    | "pull_request_review_comment"
    | "pull_request_review"
    | "issue"
    | null;
};
```

The endpoint validates this metadata at runtime. It also loads the ChatKit
session history, so a reply such as “why is this P1?” has the review
conversation needed to answer it.

The endpoint uses the Vercel AI SDK streaming protocol, but accepts only signed
ChatKit messages with validated GitHub pull-request metadata.

## Give the model tools, not credentials

The route creates the sandbox, clones the pull request, and then gives the model
the GitHub and Modal tools exposed by one Tilde MCP server:

```ts
const { mcp, closeMcp } = await createMCPClient({
  client: tilde,
  serverId: env.TILDE_MCP_SERVER_ID,
});
const sandbox = await createCodeReviewSandbox(env, tilde, pullRequest);
signal.addEventListener("abort", () => void sandbox.close(), { once: true });
const tools = await mcp.tools();
```

The application uses Modal's JavaScript SDK through Tilde's generic gRPC
reverse proxy. Tilde selects the team and proxy profile using gRPC metadata,
then injects the real Modal credentials upstream.

The sandbox has hard limits of two CPUs and 2 GiB of memory, a 30-minute
maximum lifetime, and a five-minute idle timeout. Outbound traffic is limited
to the configured Tilde reverse-proxy host. Its image contains Git, GitHub CLI,
ripgrep, jq, and pnpm. Modal caches the image layers, so tools do not need to
be installed interactively for every review.

## Configure Git once per sandbox

Git itself needs access to a private repository. Tilde provides a second
reverse-proxy profile for GitHub Git HTTPS.

The example configures the sandbox's global Git settings once. GitHub URLs are
rewritten through Tilde, and every later Git command uses the same proxy:

```ts
await run(sandbox, [
  "git",
  "config",
  "--global",
  `url.${proxyUrl}/.insteadOf`,
  "https://github.com/",
]);
```

The sandbox also stores the Tilde API key and organization header in its global
Git configuration. This is a deliberate simplicity tradeoff for the example:
the key can reach only the Tilde host, and the configuration is destroyed with
the five-minute ephemeral sandbox. GitHub and Modal credentials remain inside
Tilde and are never exposed to the sandbox.

The endpoint performs a shallow clone of all branch tips and fetches the pull
ref before invoking the model. The agent receives the sandbox ID in its system
prompt and uses Tilde's Modal MCP tools for file inspection and bounded checks.
It never needs a custom clone or filesystem tool. Repository files, PR text,
comments, command output, and tool results are treated as untrusted
evidence, not instructions that can change the target or tool policy.

## Review more than the patch

Both CodeRabbit and Greptile publicly emphasize repository context rather than
isolated changed lines. CodeRabbit also distinguishes full reviews from
incremental reviews and avoids repeating resolved feedback. Greptile exposes a
clear review anatomy: summary, confidence, file-level findings, optional
diagrams, inline severities, and reviewed-commit metadata.

The example turns those observable product lessons into an explicit protocol:

- read the PR, files, commits, existing reviews, and comments first;
- inspect `AGENTS.md`, architecture docs, security policy, test configuration,
  and path-scoped repository rules;
- trace changed symbols into callers, schemas, migrations, and tests;
- review only new commits after a prior reviewed SHA unless the user asks for a
  full review;
- suppress style-only and low-confidence output;
- respond in the original review thread for follow-up questions.

This does not pretend to reproduce Greptile's persistent code graph or either
product's learning system. The agent has the context it actually measured:
the checkout, the PR, repository instructions, and bounded validation results.

## Make the output predictable

Free-form review prose is difficult to scan and difficult to deduplicate. The
bot uses a stable summary:

```md
## Summary

## Confidence: 3/5

## Findings

## Validation

---
Reviewed commit: `...` · Mode: `incremental`
```

Inline findings use P0, P1, and P2 only:

```md
**[P1] Preserve the transaction when retrying**

The retry creates a second payment after the first request commits but times
out. Reuse the idempotency key across attempts.
```

The model must identify a concrete failure mode. It should not post praise,
nits, broad refactors, or a suggestion block unless the exact replacement is
known.

The confidence score is constrained by evidence. A missing test or failed
command lowers it. A P0 security or data-loss finding forces it into the lowest
band.

## Treat GitHub writes as transactions

Generating a review is not the same as publishing one.

The prompt requires the agent to:

1. anchor each inline comment to a line in the current diff;
2. retry an invalid anchor only once;
3. create or submit a review with GitHub's `COMMENT` event;
4. list reviews and comments again;
5. report success only when the new objects are present.

Using `COMMENT` keeps the bot outside branch-protection authority. Humans and
policy systems still decide whether a PR is approved.

## Deploy the same endpoint

The Next.js route streams with Vercel AI SDK and sets a five-minute maximum
duration. It rejects every request without validated GitHub pull-request
metadata. An internal 285-second abort budget leaves time for cleanup before
the hosting platform's hard limit. Error, abort, and finish callbacks use the
same cleanup routine for the Modal sandbox and MCP client.

Deployment is:

1. import Tilde state;
2. complete GitHub and Modal setup;
3. copy generated IDs and secrets into Vercel;
4. deploy the Next.js project;
5. point the ChatKit agent at `/api/code-review`;
6. tag the GitHub App on a test PR.

Most of the integration work is configuration because Tilde supplies the
credential and tool plane. The application stays focused on what makes this
agent useful: scope, evidence, review quality, and safe execution.

## What to add next

A production team could add automatic trigger rules, draft-PR filtering,
branch/path exclusions, per-repository severity thresholds, metrics for
accepted findings, and a durable code index.

Those features should remain explicit systems. Prompting alone cannot create a
repository graph, learn from team reactions, or guarantee webhook delivery.

The complete example is in `trytilde/examples/code-review-bot`.

## Sources

- [Greptile: Anatomy of a Review](https://www.greptile.com/docs/code-review/first-pr-review)
- [Greptile: Developer Quick Reference](https://www.greptile.com/docs/developer-quick-reference)
- [CodeRabbit: Pull Request Reviews](https://docs.coderabbit.ai/overview/pull-request-review)
- [CodeRabbit: Automatic review controls](https://docs.coderabbit.ai/configuration/auto-review)
- [CodeRabbit: Path-based review instructions](https://docs.coderabbit.ai/configuration/path-instructions)
- [GitHub: Registering a GitHub App from a manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)
- [Modal: Sandboxes](https://modal.com/docs/guide/sandboxes)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)

# Hello World Agent

The smallest complete Tilde agent: one signed ChatKit endpoint and one Vercel
UI channel. It uses Next.js and the Vercel AI SDK to keep a conversation with
an OpenAI model.

This project is the source for the Tilde
[quickstart](https://docs.trytilde.ai/quickstart).

## Prerequisites

- Node.js 22 or newer and pnpm 10.
- A Tilde account and team.
- An OpenAI API key.
- A Vercel account.

## 1. Install

```bash
git clone https://github.com/trytilde/examples.git
cd examples/hello-world-agent
pnpm install
cp .env.example .env.local
```

## 2. Create a public endpoint

The route loads its secrets only when Tilde invokes it, so the first deployment
can build before you configure the environment.

```bash
vercel deploy
```

Your ChatKit endpoint is the deployment URL plus `/api/hello-world`.

## 3. Import Tilde state

Use the endpoint from the previous step when Tilde asks for
`HELLO_WORLD_CHATKIT_ENDPOINT_URL`.

[![Deploy with Tilde](https://api.trytilde.ai/deploy-button.svg)](https://api.trytilde.ai/deploy?repository-url=https%3A%2F%2Fgithub.com%2Ftrytilde%2Fexamples&state-path=hello-world-agent%2Ftilde.state.yaml)

The state creates:

- the **Hello World** HTTP agent;
- a **Hello World UI** ChatKit channel for testing.

Save the one-time `api_key` and `webhook_signing_key` outputs from
`chatkit/agent/hello-world`.

## 4. Configure the environment

Set these values in `.env.local` and in your Vercel project:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI API key. |
| `OPENAI_MODEL` | Defaults to `gpt-5.4`. |
| `TILDE_API_KEY` | The agent's one-time `api_key` output. |
| `TILDE_BASE_URL` | Defaults to `https://api.trytilde.ai`. |
| `TILDE_ORG_ID` | Your Tilde organization ID. |
| `TILDE_TEAM_ID` | Your Tilde team ID. |
| `TILDE_WEBHOOK_SIGNING_KEY` | The agent's one-time `webhook_signing_key` output. |

Keep the OpenAI key, Tilde API key, and signing key server-side.

## 5. Deploy and test

```bash
vercel deploy --prod
```

If the production hostname differs from the first deployment, update
`HELLO_WORLD_CHATKIT_ENDPOINT_URL` to the production endpoint and re-import the
state. Open **ChatKit**, select **Hello World UI**, and send:

```text
Say hello in one sentence.
```

For local development, run `pnpm dev` and expose port 3000 through a public
HTTPS tunnel. Update the ChatKit agent endpoint to the tunnel URL plus
`/api/hello-world` before testing.

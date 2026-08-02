import {
  chatKitEndpoint,
  convertToAiSdkMessages,
  createMCPClient,
} from "@trytilde/harness-sdk-vercel-ai-node";
import { openai } from "@ai-sdk/openai";
import {
  consumeStream,
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import { env } from "@/lib/env";
import { remediationPrompt } from "@/lib/remediation/prompt";
import {
  agentRemediationTools,
  createRemediationSandbox,
  type RemediationSandbox,
} from "@/lib/remediation/sandbox";
import { sentryIssueCreatedMessage } from "@/lib/remediation/signal";
import { tilde } from "@/lib/tilde";

export const maxDuration = 300;
const REQUEST_TIMEOUT_MS = 285_000;

export const POST = chatKitEndpoint({
  client: tilde,
  webhookSigningKey: env.TILDE_WEBHOOK_SIGNING_KEY,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  async handler(request, context) {
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
      onUnprocessed: {
        sentry: {
          "sentry.issue.created": sentryIssueCreatedMessage,
        },
      },
    });
    const { mcp, closeMcp } = await createMCPClient({
      client: tilde,
      serverId: env.TILDE_MCP_SERVER_ID,
    });
    let sandbox: RemediationSandbox | undefined;
    async function closeResources() {
      for (const result of await Promise.allSettled([
        sandbox?.close(),
        closeMcp(),
      ])) {
        if (result.status === "rejected") {
          console.error(
            "Could not clean up remediation resource.",
            result.reason,
          );
        }
      }
    }
    try {
      const remoteTools = await mcp.tools();
      sandbox = await createRemediationSandbox(
        env,
        tilde,
        remoteTools,
        request.signal,
      );
      const activeSandbox = sandbox;
      request.signal.addEventListener(
        "abort",
        () => void activeSandbox.close(),
        { once: true },
      );
      const result = streamText({
        abortSignal: request.signal,
        messages: await convertToModelMessages(messages),
        model: openai(env.OPENAI_MODEL),
        stopWhen: stepCountIs(60),
        system: remediationPrompt(
          activeSandbox.id,
          activeSandbox.repositoryPath,
          env.GITHUB_REPOSITORY,
        ),
        tools: agentRemediationTools(remoteTools),
        async onError({ error }) {
          console.error("Sentry remediation failed.", error);
          await closeResources();
        },
        async onAbort() {
          await closeResources();
        },
        async onFinish() {
          await closeResources();
        },
      });
      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        originalMessages: messages,
      });
    } catch (error) {
      await closeResources();
      throw error;
    }
  },
});

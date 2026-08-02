import { chatKitEndpoint, convertToAiSdkMessages, createMCPClient } from "@trytilde/harness-sdk-vercel-ai-node";
import { openai } from "@ai-sdk/openai";
import { consumeStream, convertToModelMessages, stepCountIs, streamText } from "ai";
import { env } from "@/lib/env";
import { remediationPrompt } from "@/lib/remediation/prompt";
import {
  agentRemediationTools,
  createRemediationSandbox,
  type RemediationSandbox,
} from "@/lib/remediation/sandbox";
import { latestSentrySignalPrompt } from "@/lib/remediation/signal";
import { tilde } from "@/lib/tilde";

export const maxDuration = 300;
const REQUEST_TIMEOUT_MS = 285_000;

export const POST = chatKitEndpoint({
  client: tilde,
  webhookSigningKey: env.TILDE_WEBHOOK_SIGNING_KEY,
  async handler(request, context) {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({ messages: [...history.items, ...context.messages], chatkit: context.chatkit });
    const rawMessages = await tilde.chatkit.listMessageHistory({
      sessionId: context.sessionId,
      pageSize: 100,
    });
    const signalPrompt = latestSentrySignalPrompt(rawMessages.items);
    const { mcp, closeMcp } = await createMCPClient({ client: tilde, serverId: env.TILDE_MCP_SERVER_ID });
    let sandbox: RemediationSandbox | undefined;
    async function closeResources() { for (const result of await Promise.allSettled([sandbox?.close(), closeMcp()])) if (result.status === "rejected") console.error("Could not clean up remediation resource.", result.reason); }
    try {
      const remoteTools = await mcp.tools();
      sandbox = await createRemediationSandbox(env, tilde, remoteTools, signal);
      const activeSandbox = sandbox;
      signal.addEventListener("abort", () => void activeSandbox.close(), { once: true });
      const result = streamText({
        abortSignal: signal,
        messages: [
          ...(await convertToModelMessages(messages)),
          { role: "user", content: signalPrompt },
        ],
        model: openai(env.OPENAI_MODEL),
        stopWhen: stepCountIs(60),
        system: remediationPrompt(activeSandbox.id, activeSandbox.repositoryPath, env.GITHUB_REPOSITORY),
        tools: agentRemediationTools(remoteTools),
        async onError({ error }) { console.error("Sentry remediation failed.", error); await closeResources(); },
        async onAbort() { await closeResources(); },
        async onFinish() { await closeResources(); },
      });
      return result.toUIMessageStreamResponse({ consumeSseStream: consumeStream, originalMessages: messages });
    } catch (error) { await closeResources(); throw error; }
  },
});

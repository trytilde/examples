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
import { codeReviewPrompt } from "@/lib/code-review/prompt";
import {
  createCodeReviewSandbox,
  type CodeReviewSandbox,
} from "@/lib/code-review/sandbox";
import { env } from "@/lib/env";
import { tilde } from "@/lib/tilde";

export const maxDuration = 300;
const REQUEST_TIMEOUT_MS = 285_000;

export const POST = chatKitEndpoint({
  client: tilde,
  webhookSigningKey: env.TILDE_WEBHOOK_SIGNING_KEY,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  async handler(request, context) {
    const github = context.github;
    if (!github) {
      throw new Error("The code review agent only accepts GitHub messages.");
    }
    if (!github.owner || !github.repo || !github.pull_number) {
      throw new Error("The GitHub message must identify a pull request.");
    }
    const signal = request.signal;
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
    });
    const { mcp, closeMcp } = await createMCPClient({
      client: tilde,
      serverId: env.TILDE_MCP_SERVER_ID,
    });
    console.info("Connected to the Tilde MCP server.");
    let sandbox: CodeReviewSandbox | undefined;

    async function closeResources() {
      const results = await Promise.allSettled([sandbox?.close(), closeMcp()]);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(
            "Could not clean up a code review resource.",
            result.reason,
          );
        }
      }
    }

    try {
      const remoteTools = await mcp.tools();
      console.info(`Loaded ${Object.keys(remoteTools).length} MCP tools.`);
      const activeSandbox = await createCodeReviewSandbox(env, tilde, {
        owner: github.owner,
        pullNumber: github.pull_number,
        repo: github.repo,
      });
      sandbox = activeSandbox;
      signal.addEventListener("abort", () => void activeSandbox.close(), {
        once: true,
      });
      console.info(`Created Modal sandbox ${activeSandbox.id}.`);
      const result = streamText({
        abortSignal: signal,
        messages: await convertToModelMessages(messages),
        model: openai(env.OPENAI_MODEL),
        stopWhen: stepCountIs(40),
        system: codeReviewPrompt(activeSandbox.id, github),
        tools: remoteTools,
        async onError({ error }) {
          console.error("The code review failed.", error);
          await closeResources();
        },
        async onAbort() {
          console.warn("The code review was cancelled.");
          await closeResources();
        },
        onStepFinish({ stepNumber, toolCalls }) {
          const names = toolCalls.map(({ toolName }) => toolName).join(", ");
          console.info(
            names
              ? `Finished step ${stepNumber} using ${names}.`
              : `Finished step ${stepNumber}.`,
          );
        },
        async onFinish({ steps }) {
          console.info(`Completed the code review in ${steps.length} steps.`);
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

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
  async handler(request, context) {
    const startedAt = Date.now();
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    const history = await context.session.history();
    const messages = await convertToAiSdkMessages({
      messages: [...history.items, ...context.messages],
      chatkit: context.chatkit,
    });
    const { mcp, closeMcp } = await createMCPClient({
      client: tilde,
      serverId: env.TILDE_MCP_SERVER_ID,
    });
    console.info("code_review_mcp_connected", {
      durationMs: Date.now() - startedAt,
      sessionId: context.sessionId,
    });
    let sandbox: CodeReviewSandbox | undefined;
    let closePromise: Promise<void> | undefined;
    const close = () => {
      closePromise ??= (async () => {
        const results = await Promise.allSettled([
          sandbox?.close(),
          closeMcp(),
        ]);
        for (const result of results) {
          if (result.status === "rejected") {
            console.error("code_review_cleanup_failed", {
              error: result.reason,
              sessionId: context.sessionId,
            });
          }
        }
      })();
      return closePromise;
    };

    try {
      const remoteTools = await mcp.tools();
      console.info("code_review_mcp_tools_loaded", {
        durationMs: Date.now() - startedAt,
        sessionId: context.sessionId,
        toolCount: Object.keys(remoteTools).length,
      });
      const activeSandbox = await createCodeReviewSandbox(
        env,
        tilde,
        signal,
      );
      sandbox = activeSandbox;
      console.info("code_review_sandbox_ready", {
        durationMs: Date.now() - startedAt,
        sandboxId: activeSandbox.id,
        sessionId: context.sessionId,
      });
      const tools = {
        ...Object.fromEntries(
          Object.entries(remoteTools).filter(
            ([name]) => !name.startsWith("modal_"),
          ),
        ),
        ...activeSandbox.tools,
      };
      const result = streamText({
        abortSignal: signal,
        messages: await convertToModelMessages(messages),
        model: openai(env.OPENAI_MODEL),
        stopWhen: stepCountIs(40),
        system: codeReviewPrompt(activeSandbox.id, context.github),
        tools,
        async onError({ error }) {
          console.error("code_review_failed", {
            error,
            sandboxId: activeSandbox.id,
            sessionId: context.sessionId,
          });
          await close();
        },
        async onAbort() {
          console.warn("code_review_aborted", {
            durationMs: Date.now() - startedAt,
            sandboxId: activeSandbox.id,
            sessionId: context.sessionId,
          });
          await close();
        },
        onStepFinish({ stepNumber, toolCalls }) {
          console.info("code_review_step", {
            sessionId: context.sessionId,
            stepNumber,
            tools: toolCalls.map(({ toolName }) => toolName),
          });
        },
        async onFinish({ finishReason, steps, text }) {
          console.info("code_review_completed", {
            durationMs: Date.now() - startedAt,
            finishReason,
            responseLength: text.length,
            sandboxId: activeSandbox.id,
            sessionId: context.sessionId,
            stepCount: steps.length,
          });
          await close();
        },
      });

      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        originalMessages: messages,
      });
    } catch (error) {
      await close();
      throw error;
    }
  },
});

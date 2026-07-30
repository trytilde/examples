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
import { chatKitEndpoint } from "@/lib/tilde/chatkit";
import { createTildeMcpClient } from "@/lib/tilde/mcp";
import type { TildeConfig } from "@/lib/tilde/types";

export const maxDuration = 300;

const tilde: TildeConfig = {
  apiKey: env.TILDE_API_KEY,
  baseUrl: env.TILDE_BASE_URL,
  orgId: env.TILDE_ORG_ID,
  teamId: env.TILDE_TEAM_ID,
};

export const POST = chatKitEndpoint({
  config: tilde,
  webhookSigningKey: env.TILDE_WEBHOOK_SIGNING_KEY,
  async handler(request, context) {
    const startedAt = Date.now();
    const messages = [...(await context.history()), ...context.messages];
    const { mcp, closeMcp } = await createTildeMcpClient(
      tilde,
      env.TILDE_MCP_SERVER_ID,
    );
    let sandbox: CodeReviewSandbox | undefined;

    try {
      const remoteTools = await mcp.tools();
      const activeSandbox = await createCodeReviewSandbox(
        env,
        tilde,
        request.signal,
      );
      sandbox = activeSandbox;
      const tools = {
        ...Object.fromEntries(
          Object.entries(remoteTools).filter(
            ([name]) => !name.startsWith("modal_"),
          ),
        ),
        ...activeSandbox.tools,
      };
      const result = streamText({
        abortSignal: request.signal,
        messages: await convertToModelMessages(messages),
        model: openai(env.OPENAI_MODEL),
        stopWhen: stepCountIs(40),
        system: codeReviewPrompt(activeSandbox.id, context.github),
        tools,
        onError({ error }) {
          console.error("code_review_failed", {
            error,
            sandboxId: activeSandbox.id,
            sessionId: context.sessionId,
          });
          void activeSandbox.close().finally(closeMcp);
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
          await activeSandbox.close();
          await closeMcp();
        },
      });

      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        originalMessages: messages,
      });
    } catch (error) {
      await sandbox?.close();
      await closeMcp();
      throw error;
    }
  },
});

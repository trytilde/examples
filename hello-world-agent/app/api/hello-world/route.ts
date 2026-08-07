import { openai } from "@ai-sdk/openai";
import {
  chatKitEndpoint,
  convertToAiSdkMessages,
  createClient,
} from "@trytilde/harness-sdk-vercel-ai-node";
import {
  consumeStream,
  convertToModelMessages,
  streamText,
} from "ai";

export const maxDuration = 60;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createAgentHandler() {
  const tilde = createClient({
    apiKey: requiredEnv("TILDE_API_KEY"),
    baseUrl: process.env.TILDE_BASE_URL ?? "https://api.trytilde.ai",
    orgId: requiredEnv("TILDE_ORG_ID"),
    orgSubdomain: false,
    teamId: requiredEnv("TILDE_TEAM_ID"),
  });

  return chatKitEndpoint({
    client: tilde,
    webhookSigningKey: requiredEnv("TILDE_WEBHOOK_SIGNING_KEY"),
    requestTimeoutMs: 55_000,
    async handler(request, context) {
      const history = await context.session.history();
      const messages = await convertToAiSdkMessages({
        messages: [...history.items, ...context.messages],
        chatkit: context.chatkit,
      });
      const result = streamText({
        abortSignal: request.signal,
        messages: await convertToModelMessages(messages),
        model: openai(process.env.OPENAI_MODEL ?? "gpt-5.4"),
        system: "You are a helpful assistant. Keep your answers concise.",
      });

      return result.toUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        originalMessages: messages,
      });
    },
  });
}

export async function POST(request: Request) {
  return createAgentHandler()(request);
}

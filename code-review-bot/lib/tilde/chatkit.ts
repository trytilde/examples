import { createHmac, timingSafeEqual } from "node:crypto";
import type { UIMessage } from "ai";
import { z } from "zod";
import { tildeHeaders } from "./paths";
import type { JsonValue, TildeConfig } from "./types";

const messagePartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .loose();

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(messagePartSchema),
  metadata: z.custom<JsonValue>().optional(),
});

const requestBodySchema = z.object({
  chatId: z.string().nullable().optional(),
  messages: z.array(messageSchema),
});

const githubMetadataSchema = z.object({
  event: z.string().nullable(),
  delivery_id: z.string(),
  installation_id: z.number().nullable(),
  repository_id: z.number().nullable(),
  owner: z.string().nullable(),
  repo: z.string().nullable(),
  issue_number: z.number().nullable(),
  pull_number: z.number().nullable(),
  comment_id: z.number().nullable(),
  comment_node_id: z.string().nullable(),
  comment_url: z.string().nullable(),
  html_url: z.string().nullable(),
  thread_kind: z
    .enum([
      "issue",
      "pull_request",
      "pull_request_review_comment",
      "pull_request_review",
    ])
    .nullable(),
  message_identity: z.string(),
});

const providerMetadataSchema = z.object({
  provider: z.literal("chatkit.channel.github"),
  github: githubMetadataSchema,
});

export type GitHubChatKitMetadata = z.infer<typeof githubMetadataSchema>;
export type ChatKitRequestMessage = z.infer<typeof messageSchema>;

export type ChatKitContext = {
  github?: GitHubChatKitMetadata;
  messages: UIMessage[];
  orgId: string;
  sessionId: string;
  teamId: string;
  history(): Promise<UIMessage[]>;
};

type ChatKitEndpointOptions = {
  config: TildeConfig;
  webhookSigningKey: string;
  handler(
    request: Request,
    context: ChatKitContext,
  ): Promise<Response> | Response;
};

export function chatKitEndpoint(
  options: ChatKitEndpointOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let context: ChatKitContext;
    let forwarded: Request;
    try {
      const rawBody = new Uint8Array(await request.arrayBuffer());
      verifyWebhook(request.headers, rawBody, options.webhookSigningKey);
      const body = requestBodySchema.parse(
        JSON.parse(new TextDecoder().decode(rawBody)),
      );
      const orgId = requiredHeader(request.headers, "x-tilde-org-id");
      const teamId = requiredHeader(request.headers, "x-tilde-team-id");
      const sessionId = requiredHeader(request.headers, "x-tilde-session-id");
      const requestIds = new Set(body.messages.map(({ id }) => id));
      const messages = body.messages.map(toUiMessage);
      const github = latestGitHubMetadata(body.messages);
      forwarded = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: rawBody,
        signal: request.signal,
        duplex: "half",
      } as RequestInit);

      context = {
        ...(github ? { github } : {}),
        messages,
        orgId,
        sessionId,
        teamId,
        async history() {
          const history = await listAllHistory(
            options.config,
            sessionId,
          );
          return history
            .filter((message) => !requestIds.has(message.id))
            .map(historyToUiMessage);
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status =
        error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 401;
      console.warn("chatkit_request_rejected", { message, status });
      return Response.json({ error: message }, { status });
    }

    return options.handler(forwarded, context);
  };
}

function verifyWebhook(
  headers: Headers,
  body: Uint8Array,
  signingKey: string,
): void {
  const webhookId = requiredHeader(headers, "x-tilde-webhook-id");
  const timestamp = requiredHeader(headers, "x-tilde-timestamp");
  const signature = requiredHeader(headers, "x-tilde-signature");
  if (!/^\d+$/.test(timestamp)) throw new Error("Invalid webhook timestamp");
  if (
    Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300
  ) {
    throw new Error("Webhook timestamp is outside tolerance");
  }
  const expected = `hmac-sha256=${createHmac("sha256", signingKey)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("hex")}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error(`Invalid webhook signature for ${webhookId}`);
  }
}

function latestGitHubMetadata(
  messages: ChatKitRequestMessage[],
): GitHubChatKitMetadata | undefined {
  for (const message of messages.toReversed()) {
    const result = providerMetadataSchema.safeParse(message.metadata);
    if (result.success) return result.data.github;
  }
  return undefined;
}

function toUiMessage(message: ChatKitRequestMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: textParts(message.parts),
    metadata: message.metadata,
  } as UIMessage;
}

type HistoryMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  type: "text" | "ui";
  text?: string;
  parts?: { type: string; text?: string | null }[];
  created_at?: string;
};

function historyToUiMessage(message: HistoryMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts:
      message.type === "text"
        ? [{ type: "text", text: message.text ?? "" }]
        : textParts(message.parts ?? []),
  } as UIMessage;
}

function textParts(
  parts: { type: string; text?: string | null }[],
): { type: "text"; text: string }[] {
  const text = parts
    .filter((part) => part.type === "text" || part.type === "reasoning")
    .map((part) => part.text ?? "")
    .filter(Boolean);
  return text.length > 0
    ? text.map((value) => ({ type: "text" as const, text: value }))
    : [{ type: "text", text: "" }];
}

async function listAllHistory(
  config: TildeConfig,
  sessionId: string,
): Promise<HistoryMessage[]> {
  const items: HistoryMessage[] = [];
  let nextPageToken: string | undefined;
  do {
    const url = new URL(
      `/api/v1/team/${encodeURIComponent(config.teamId)}/chatkit/sessions/${encodeURIComponent(sessionId)}/messages`,
      config.baseUrl,
    );
    url.searchParams.set("page_size", "100");
    if (nextPageToken) {
      url.searchParams.set("next_page_token", nextPageToken);
    }
    const response = await fetch(url, {
      headers: tildeHeaders(config),
    });
    if (!response.ok) {
      throw new Error(
        `Unable to load ChatKit history (${response.status}): ${await response.text()}`,
      );
    }
    const page = (await response.json()) as {
      items: HistoryMessage[];
      next_page_token?: string | null;
    };
    items.push(...page.items);
    nextPageToken = page.next_page_token ?? undefined;
  } while (nextPageToken);
  return items.sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name} header`);
  return value;
}

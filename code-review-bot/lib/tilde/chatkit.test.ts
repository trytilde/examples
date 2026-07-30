import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { chatKitEndpoint } from "./chatkit";

const config = {
  apiKey: "sk--test",
  baseUrl: "https://api.example.com",
  orgId: "acme",
  teamId: "team-1",
};

const body = JSON.stringify({
  messages: [
    {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "@reviewbot review this" }],
      metadata: {
        provider: "chatkit.channel.github",
        github: {
          event: "issue_comment.created",
          delivery_id: "delivery-1",
          installation_id: 42,
          repository_id: 100,
          owner: "acme",
          repo: "widget",
          issue_number: 7,
          pull_number: 7,
          comment_id: 11,
          comment_node_id: "IC_11",
          comment_url: "https://api.github.com/comments/11",
          html_url: "https://github.com/acme/widget/pull/7#issuecomment-11",
          thread_kind: "pull_request",
          message_identity: "github:delivery-1",
        },
      },
    },
  ],
});

describe("chatKitEndpoint", () => {
  it("verifies the webhook and surfaces typed GitHub metadata", async () => {
    const handler = vi.fn((_request, context) =>
      Response.json({
        owner: context.github?.owner,
        pullNumber: context.github?.pull_number,
        text: context.messages[0]?.parts[0],
      }),
    );
    const endpoint = chatKitEndpoint({
      config,
      webhookSigningKey: "tilde_whsec_test",
      handler,
    });

    const response = await endpoint(signedRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      owner: "acme",
      pullNumber: 7,
      text: { type: "text", text: "@reviewbot review this" },
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects an invalid signature before invoking the handler", async () => {
    const handler = vi.fn(() => Response.json({ ok: true }));
    const endpoint = chatKitEndpoint({
      config,
      webhookSigningKey: "tilde_whsec_test",
      handler,
    });
    const request = signedRequest(body);
    request.headers.set("x-tilde-signature", "hmac-sha256=bad");

    const response = await endpoint(request);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not turn an agent failure into an authentication response", async () => {
    const endpoint = chatKitEndpoint({
      config,
      webhookSigningKey: "tilde_whsec_test",
      handler() {
        throw new Error("model unavailable");
      },
    });

    await expect(endpoint(signedRequest(body))).rejects.toThrow(
      "model unavailable",
    );
  });
});

function signedRequest(payload: string): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `hmac-sha256=${createHmac(
    "sha256",
    "tilde_whsec_test",
  )
    .update(timestamp)
    .update(".")
    .update(payload)
    .digest("hex")}`;
  return new Request("https://agent.example.com/api/code-review", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "x-tilde-org-id": "acme",
      "x-tilde-session-id": "session-1",
      "x-tilde-signature": signature,
      "x-tilde-team-id": "team-1",
      "x-tilde-timestamp": timestamp,
      "x-tilde-webhook-id": "webhook-1",
    },
  });
}

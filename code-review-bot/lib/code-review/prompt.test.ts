import { describe, expect, it } from "vitest";
import { codeReviewPrompt } from "./prompt";

describe("codeReviewPrompt", () => {
  it("uses the configured review policy and Modal sandbox", () => {
    const prompt = codeReviewPrompt("sb-test", {
      comment_id: 1,
      comment_node_id: "comment",
      comment_url: "https://github.com/trytilde/examples/pull/7#issuecomment-1",
      delivery_id: "delivery",
      event: "issue_comment",
      html_url: "https://github.com/trytilde/examples/pull/7",
      installation_id: 1,
      issue_number: 7,
      message_identity: "message",
      owner: "trytilde",
      pull_number: 7,
      repo: "examples",
      repository_id: 1,
      thread_kind: "pull_request",
    });

    expect(prompt).toContain("Modal sandbox sb-test");
    expect(prompt).toContain("Do not execute any linters, tests");
    expect(prompt).toContain("P0 = critical security vulnerabilty or runtime bug");
    expect(prompt).toContain("P2 = style and code patterns");
  });
});

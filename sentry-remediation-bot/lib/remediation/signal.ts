import type { SentrySignalByType } from "@trytilde/harness-sdk-vercel-ai-node";
import type { UIMessage } from "ai";

type SentryIssueCreatedSignal =
  SentrySignalByType["sentry.issue.created"];

/** Convert a typed Sentry issue-created signal into the model's remediation task. */
export function sentryIssueCreatedMessage(
  signal: SentryIssueCreatedSignal,
): UIMessage {
  const { event, issue } = signal.data.data;
  const eventId =
    typeof event === "object" &&
    event !== null &&
    "eventID" in event &&
    typeof event.eventID === "string"
      ? event.eventID
      : "not provided";
  const prompt = [
    "A new Sentry issue signal triggered this remediation run.",
    `Summary: ${signal.summary ?? issue.title}`,
    `Issue: ${issue.shortId ?? issue.id} (${issue.id})`,
    `URL: ${issue.permalink ?? "not provided"}`,
    `Event ID: ${eventId}`,
    `Title: ${issue.title}`,
    "Investigate this exact issue and complete the remediation workflow described in the system prompt.",
  ].join("\n");

  return {
    id: signal.id,
    role: "user",
    parts: [{ type: "text", text: prompt }],
  };
}

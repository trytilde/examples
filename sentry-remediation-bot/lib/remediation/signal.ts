import { z } from "zod";

const sentrySignalMessageSchema = z.object({
  body: z.object({
    data: z.object({
      data: z.object({
        event: z.object({ eventID: z.string().min(1) }).passthrough(),
        issue: z
          .object({
            id: z.string().min(1),
            permalink: z.string().url(),
            shortId: z.string().min(1),
            title: z.string().min(1),
          })
          .passthrough(),
      }),
      summary: z.string().min(1),
    }),
  }),
  kind: z.literal("signal"),
  metadata: z.object({ signal_type: z.literal("sentry.issue.created") }).passthrough(),
  role: z.literal("system"),
});

/** Convert the newest raw Sentry signal message into the explicit task given to the model. */
export function latestSentrySignalPrompt(messages: unknown[]): string {
  for (const message of messages.toReversed()) {
    const parsed = sentrySignalMessageSchema.safeParse(message);
    if (!parsed.success) continue;
    const { event, issue } = parsed.data.body.data.data;
    return [
      "A new Sentry issue signal triggered this remediation run.",
      `Summary: ${parsed.data.body.data.summary}`,
      `Issue: ${issue.shortId} (${issue.id})`,
      `URL: ${issue.permalink}`,
      `Event ID: ${event.eventID}`,
      `Title: ${issue.title}`,
      "Investigate this exact issue and complete the remediation workflow described in the system prompt.",
    ].join("\n");
  }
  throw new Error("The remediation session does not contain a valid Sentry issue-created signal");
}

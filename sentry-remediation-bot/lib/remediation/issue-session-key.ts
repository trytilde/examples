/** Builds the stable ChatKit session key for one Sentry issue. */
export function sentryIssueSessionKey(issueId: string): string {
  const normalizedIssueId = issueId.trim();
  if (!normalizedIssueId) throw new Error("Sentry issue ID is required.");
  return `sentry#${normalizedIssueId}`;
}

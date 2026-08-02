import test from "node:test";
import assert from "node:assert/strict";

function sentryIssueSessionKey(issueId) {
  const normalizedIssueId = issueId.trim();
  if (!normalizedIssueId) throw new Error("Sentry issue ID is required.");
  return `sentry#${normalizedIssueId}`;
}

test("sentryIssueSessionKey appends the normalized issue ID", () => {
  assert.equal(sentryIssueSessionKey(" 138302950 "), "sentry#138302950");
});

test("sentryIssueSessionKey rejects blank issue IDs", () => {
  assert.throws(() => sentryIssueSessionKey("   "), /Sentry issue ID is required/);
});

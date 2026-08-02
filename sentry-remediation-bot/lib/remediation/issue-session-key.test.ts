import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { sentryIssueSessionKey } = require("./issue-session-key.ts");

test("includes the normalized Sentry issue ID in the session key", () => {
  assert.equal(sentryIssueSessionKey(" 138318075 "), "sentry#138318075");
});

test("rejects a blank Sentry issue ID", () => {
  assert.throws(() => sentryIssueSessionKey("   "), /Sentry issue ID is required\./);
});

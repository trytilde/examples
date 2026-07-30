import { describe, expect, it } from "vitest";
import { isSafeGitBranch } from "./git-ref";

describe("isSafeGitBranch", () => {
  it.each(["main", "release/v1.2", "feature/review-bot-", "123"])(
    "accepts %s",
    (value) => expect(isSafeGitBranch(value)).toBe(true),
  );

  it.each([
    "",
    "-option",
    "feature//bot",
    "feature/../main",
    ".hidden",
    "feature/.hidden",
    "feature.lock",
    "feature/@{upstream}",
    "feature:main",
    "feature main",
  ])("rejects %s", (value) => {
    expect(isSafeGitBranch(value)).toBe(false);
  });
});

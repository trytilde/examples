import { describe, expect, it } from "vitest";
import { isWorkspacePath } from "./workspace-path";

describe("isWorkspacePath", () => {
  it.each([
    "/workspace",
    "/workspace/repository",
    "/workspace/repository/src/index.ts",
  ])("accepts %s", (value) => {
    expect(isWorkspacePath(value)).toBe(true);
  });

  it.each([
    "/",
    "/workspace2",
    "/workspace/../etc/passwd",
    "/workspace/repository/../../etc/passwd",
    "/workspace//repository",
    "workspace/repository",
    "/workspace/repository\0secret",
  ])("rejects %s", (value) => {
    expect(isWorkspacePath(value)).toBe(false);
  });
});

import { posix } from "node:path";

export function isWorkspacePath(value: string): boolean {
  if (value.includes("\0") || posix.normalize(value) !== value) {
    return false;
  }
  return value === "/workspace" || value.startsWith("/workspace/");
}

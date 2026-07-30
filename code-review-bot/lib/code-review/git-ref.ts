const FORBIDDEN_REF_CHARACTERS = /[\u0000-\u0020\u007f~^:?*[\]\\]/;

export function isSafeGitBranch(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 255 ||
    value === "@" ||
    value.startsWith("-") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("//") ||
    FORBIDDEN_REF_CHARACTERS.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every(
      (component) =>
        component.length > 0 &&
        !component.startsWith(".") &&
        !component.endsWith(".lock"),
    );
}

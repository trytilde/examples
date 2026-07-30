import { describe, expect, it } from "vitest";
import { gitProxyCommand } from "./git-proxy";

describe("gitProxyCommand", () => {
  it("does not persist proxy credentials in Git configuration", () => {
    const command = gitProxyCommand(
      {
        apiKey: "sk--test",
        orgId: "example",
        proxyUrl: "https://api.example.com/reverse-proxy/github",
      },
      ["clone", "https://api.example.com/reverse-proxy/github/acme/app.git"],
    );

    expect(command.slice(0, 2)).toEqual(["git", "-c"]);
    expect(command).not.toContain("config");
    expect(command).not.toContain("--global");
  });
});

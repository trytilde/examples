import {
  createMCPClient as createVercelMcpClient,
  type MCPClient,
} from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { mcpServerUrl, tildeHeaders } from "./paths";
import type { TildeConfig } from "./types";

export type TildeMcpHandle = {
  mcp: Omit<MCPClient, "tools"> & {
    tools(): Promise<ToolSet>;
  };
  closeMcp(): Promise<void>;
};

export async function createTildeMcpClient(
  config: TildeConfig,
  serverId: string,
): Promise<TildeMcpHandle> {
  const mcp = await createVercelMcpClient({
    transport: {
      type: "http",
      url: mcpServerUrl(config, serverId),
      headers: tildeHeaders(config),
    },
  });
  let closed = false;
  return {
    mcp,
    async closeMcp() {
      if (closed) return;
      closed = true;
      await mcp.close();
    },
  };
}

import type { TildeConfig } from "./types";

export function mcpServerUrl(config: TildeConfig, serverId: string): string {
  return new URL(
    `/api/v1/team/${encodeURIComponent(config.teamId)}/mcp/mcp-server/${encodeURIComponent(serverId)}/mcp`,
    config.baseUrl,
  ).toString();
}

export function reverseProxyUrl(
  config: TildeConfig,
  profileId: string,
): string {
  return new URL(
    `/api/v1/team/${encodeURIComponent(config.teamId)}/reverse-proxy/${encodeURIComponent(profileId)}/`,
    config.baseUrl,
  ).toString();
}

export function tildeHeaders(config: TildeConfig): Record<string, string> {
  return {
    "x-api-key": config.apiKey,
    "x-tilde-org-id": config.orgId,
    "x-tilde-team-id": config.teamId,
  };
}

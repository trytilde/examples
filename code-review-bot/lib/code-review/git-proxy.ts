export type GitProxyConfig = {
  apiKey: string;
  orgId: string;
  proxyUrl: string;
};

export function gitProxyCommand(
  config: GitProxyConfig,
  args: string[],
): string[] {
  const headerKey = `http.${config.proxyUrl}/.extraHeader`;
  return [
    "git",
    "-c",
    `${headerKey}=x-api-key: ${config.apiKey}`,
    "-c",
    `${headerKey}=x-tilde-org-id: ${config.orgId}`,
    ...args,
  ];
}

import { createTildeGrpcReverseProxy, reverseProxyPath, type Client } from "@trytilde/harness-sdk";
import { ModalClient, type Sandbox, type SandboxExecParams } from "modal";
import { parseArgsStringToArgv } from "string-argv";
import type { Env } from "@/lib/env";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_COMMAND_TIMEOUT_MS = 120 * 1000;
export type RemediationSandbox = { close(): Promise<void>; id: string; repositoryPath: string };

export async function createRemediationSandbox(env: Env, client: Client): Promise<RemediationSandbox> {
  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const gitProxyUrl = new URL(reverseProxyPath({ profileId: env.TILDE_GITHUB_GIT_PROXY_PROFILE_ID, teamId: client.config.teamId }), client.config.baseUrl).toString().replace(/\/$/, "");
  const modalProxy = createTildeGrpcReverseProxy({ client, profileId: env.TILDE_MODAL_PROXY_PROFILE_ID });
  const modal = createModalClient(modalProxy);
  let sandbox: Sandbox | undefined;
  let closed = false;
  async function close() { if (closed) return; closed = true; await sandbox?.terminate().catch((error) => console.error("Could not stop Modal sandbox.", error)); modal.close(); }
  try {
    const app = await modal.apps.fromName(env.TILDE_MODAL_APP_NAME, { createIfMissing: true });
    const image = modal.images.fromRegistry("node:22-bookworm").dockerfileCommands([
      "RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends build-essential ca-certificates curl git gh jq ripgrep && rm -rf /var/lib/apt/lists/*",
      "RUN npm install --global pnpm@10",
    ]);
    sandbox = await modal.sandboxes.create(app, image, {
      cpu: 4,
      cpuLimit: 4,
      idleTimeoutMs: FIVE_MINUTES_MS,
      memoryMiB: 4096,
      memoryLimitMiB: 4096,
      outboundDomainAllowlist: [
        new URL(client.config.baseUrl).hostname,
        "registry.npmjs.org",
        "index.crates.io",
        "static.crates.io",
        "pypi.org",
        "files.pythonhosted.org",
        "proxy.golang.org",
        "sum.golang.org",
        "repo.maven.apache.org",
      ],
      tags: { agent: "sentry-remediation" },
      timeoutMs: THIRTY_MINUTES_MS,
    });
    await requireSuccess(sandbox, "mkdir -p /workspace");
    await requireSuccess(sandbox, `git config --global url.${gitProxyUrl}/.insteadOf https://github.com/`);
    await requireSuccess(sandbox, `git config --global --add http.${gitProxyUrl}/.extraHeader "x-api-key: ${env.TILDE_API_KEY}"`);
    await requireSuccess(sandbox, `git config --global --add http.${gitProxyUrl}/.extraHeader "x-tilde-org-id: ${env.TILDE_ORG_ID}"`);
    const repositoryPath = `/workspace/${repo}`;
    await requireSuccess(sandbox, `git clone https://github.com/${owner}/${repo}.git ${repositoryPath}`);
    return { close, id: sandbox.sandboxId, repositoryPath };
  } catch (error) { await close(); throw error; }
}

function createModalClient(proxy: ReturnType<typeof createTildeGrpcReverseProxy>): ModalClient {
  const previous = process.env.MODAL_SERVER_URL; process.env.MODAL_SERVER_URL = proxy.endpoint;
  try { return new ModalClient({ endpoint: proxy.endpoint, grpcMiddleware: [proxy.middleware], tokenId: "tilde-reverse-proxy", tokenSecret: "tilde-reverse-proxy" }); }
  finally { if (previous === undefined) delete process.env.MODAL_SERVER_URL; else process.env.MODAL_SERVER_URL = previous; }
}
async function requireSuccess(sandbox: Sandbox, command: string) {
  const result = await runCommand(sandbox, parseArgsStringToArgv(command), { timeoutMs: MAX_COMMAND_TIMEOUT_MS, workdir: "/" });
  if (result.exitCode !== 0) throw new Error(`Sandbox command failed: ${result.stderr || result.stdout}`);
}
async function runCommand(sandbox: Sandbox, command: string[], params: SandboxExecParams = {}) {
  const process = await sandbox.exec(command, { ...params, mode: "text", stderr: "pipe", stdout: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([process.wait(), process.stdout.readText(), process.stderr.readText()]);
  return { exitCode, stdout, stderr };
}

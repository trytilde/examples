import {
  createTildeGrpcReverseProxy,
  reverseProxyPath,
  type Client,
} from "@trytilde/harness-sdk";
import {
  ModalClient,
  type Sandbox,
  type SandboxExecParams,
} from "modal";
import { parseArgsStringToArgv } from "string-argv";
import type { Env } from "@/lib/env";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_COMMAND_TIMEOUT_MS = 90 * 1000;
const MAX_OUTPUT_CHARS = 40_000;
export type CodeReviewSandbox = {
  close(): Promise<void>;
  id: string;
};

type PullRequest = {
  owner: string;
  pullNumber: number;
  repo: string;
};

export async function createCodeReviewSandbox(
  env: Env,
  client: Client,
  pullRequest: PullRequest,
): Promise<CodeReviewSandbox> {
  const gitProxyUrl = new URL(
    reverseProxyPath({
      profileId: env.TILDE_GITHUB_GIT_PROXY_PROFILE_ID,
      teamId: client.config.teamId,
    }),
    client.config.baseUrl,
  )
    .toString()
    .replace(/\/$/, "");
  const modalProxy = createTildeGrpcReverseProxy({
    client,
    profileId: env.TILDE_MODAL_PROXY_PROFILE_ID,
  });
  const modal = createModalClient(modalProxy);
  let sandbox: Sandbox | undefined;
  try {
    const app = await modal.apps.fromName(env.TILDE_MODAL_APP_NAME, {
      createIfMissing: true,
    });
    const image = modal.images
      .fromRegistry("node:22-bookworm")
      .dockerfileCommands([
        "RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git gh jq ripgrep && rm -rf /var/lib/apt/lists/*",
        "RUN npm install --global pnpm@10",
      ]);
    sandbox = await modal.sandboxes.create(app, image, {
      cpu: 2,
      cpuLimit: 2,
      idleTimeoutMs: FIVE_MINUTES_MS,
      memoryMiB: 2048,
      memoryLimitMiB: 2048,
      outboundDomainAllowlist: [new URL(client.config.baseUrl).hostname],
      tags: { agent: "code-review" },
      timeoutMs: THIRTY_MINUTES_MS,
    });
  } catch (error) {
    await sandbox?.terminate().catch(() => undefined);
    modal.close();
    throw error;
  }

  try {
    await requireSuccessfulCommand(sandbox, "mkdir -p /workspace");
    await requireSuccessfulCommand(
      sandbox,
      `git config --global url.${gitProxyUrl}/.insteadOf https://github.com/`,
    );
    await requireSuccessfulCommand(
      sandbox,
      `git config --global --add http.${gitProxyUrl}/.extraHeader "x-api-key: ${env.TILDE_API_KEY}"`,
    );
    await requireSuccessfulCommand(
      sandbox,
      `git config --global --add http.${gitProxyUrl}/.extraHeader "x-tilde-org-id: ${env.TILDE_ORG_ID}"`,
    );
    const workdir = `/workspace/${pullRequest.repo}`;
    await requireSuccessfulCommand(
      sandbox,
      `git clone --depth=1 --no-single-branch --no-checkout https://github.com/${pullRequest.owner}/${pullRequest.repo}.git ${workdir}`,
    );
    await requireSuccessfulCommand(
      sandbox,
      `git -C ${workdir} fetch --depth=1 origin +refs/pull/${pullRequest.pullNumber}/head:refs/remotes/origin/pull/${pullRequest.pullNumber}/head`,
    );
    await requireSuccessfulCommand(
      sandbox,
      `git -C ${workdir} checkout --detach refs/remotes/origin/pull/${pullRequest.pullNumber}/head`,
    );
  } catch (error) {
    await sandbox.terminate().catch(() => undefined);
    modal.close();
    throw error;
  }

  let closed = false;
  return {
    id: sandbox.sandboxId,
    async close() {
      if (closed) return;
      closed = true;
      await sandbox.terminate().catch((error) => {
        console.error(
          `Could not stop Modal sandbox ${sandbox.sandboxId}.`,
          error,
        );
      });
      modal.close();
    },
  };
}

function createModalClient(
  proxy: ReturnType<typeof createTildeGrpcReverseProxy>,
): ModalClient {
  // Modal 0.9 declares `endpoint` but reads MODAL_SERVER_URL synchronously.
  const previousServerUrl = process.env.MODAL_SERVER_URL;
  process.env.MODAL_SERVER_URL = proxy.endpoint;
  try {
    return new ModalClient({
      endpoint: proxy.endpoint,
      grpcMiddleware: [proxy.middleware],
      tokenId: "tilde-reverse-proxy",
      tokenSecret: "tilde-reverse-proxy",
    });
  } finally {
    if (previousServerUrl === undefined) {
      delete process.env.MODAL_SERVER_URL;
    } else {
      process.env.MODAL_SERVER_URL = previousServerUrl;
    }
  }
}

async function requireSuccessfulCommand(
  sandbox: Sandbox,
  command: string,
): Promise<void> {
  const argv = parseArgsStringToArgv(command);
  const result = await runCommand(sandbox, argv, {
    timeoutMs: MAX_COMMAND_TIMEOUT_MS,
    workdir: "/",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Sandbox command failed (${argv[0]}): ${result.stderr || result.stdout}`,
    );
  }
}

async function runCommand(
  sandbox: Sandbox,
  command: string[],
  params: SandboxExecParams = {},
) {
  const process = await sandbox.exec(command, {
    ...params,
    mode: "text",
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.wait(),
    process.stdout.readText(),
    process.stderr.readText(),
  ]);
  return {
    exitCode,
    stderr: truncateOutput(stderr),
    stdout: truncateOutput(stdout),
  };
}

function truncateOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n[output truncated]`;
}

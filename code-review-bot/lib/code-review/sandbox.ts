import {
  createTildeGrpcReverseProxy,
  reverseProxyPath,
  type Client,
} from "@tilde/harness-sdk";
import {
  ModalClient,
  type Sandbox,
  type SandboxExecParams,
} from "modal";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Env } from "@/lib/env";
import { isSafeGitBranch } from "./git-ref";
import { gitProxyCommand, type GitProxyConfig } from "./git-proxy";
import { isWorkspacePath } from "./workspace-path";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_COMMAND_TIMEOUT_MS = 90 * 1000;
const MAX_OUTPUT_CHARS = 40_000;
const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
const workspacePath = z
  .string()
  .refine(isWorkspacePath, "Path must be a normalized /workspace path");

export type CodeReviewSandbox = {
  close(): Promise<void>;
  id: string;
  tools: ToolSet;
};

export async function createCodeReviewSandbox(
  env: Env,
  client: Client,
  abortSignal: AbortSignal,
): Promise<CodeReviewSandbox> {
  abortSignal.throwIfAborted();
  const modalProxy = createTildeGrpcReverseProxy({
    client,
    profileId: env.TILDE_MODAL_PROXY_PROFILE_ID,
  });
  const modal = createModalClient(modalProxy);
  let sandbox: Sandbox | undefined;
  try {
    abortSignal.throwIfAborted();
    const app = await modal.apps.fromName(env.TILDE_MODAL_APP_NAME, {
      createIfMissing: true,
    });
    abortSignal.throwIfAborted();
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
  const abort = () => {
    void sandbox
      .terminate()
      .catch(() => undefined)
      .finally(() => modal.close());
  };
  abortSignal.addEventListener("abort", abort, { once: true });
  if (abortSignal.aborted) {
    abort();
    abortSignal.throwIfAborted();
  }

  try {
    await requireSuccessfulCommand(sandbox, ["mkdir", "-p", "/workspace"]);
  } catch (error) {
    abortSignal.removeEventListener("abort", abort);
    await sandbox.terminate().catch(() => undefined);
    modal.close();
    throw error;
  }

  const gitProxy: GitProxyConfig = {
    apiKey: env.TILDE_API_KEY,
    orgId: env.TILDE_ORG_ID,
    proxyUrl: new URL(
      reverseProxyPath({
        profileId: env.TILDE_GITHUB_GIT_PROXY_PROFILE_ID,
        teamId: client.config.teamId,
      }),
      client.config.baseUrl,
    )
      .toString()
      .replace(/\/$/, ""),
  };
  let closed = false;
  return {
    id: sandbox.sandboxId,
    tools: sandboxTools(sandbox, gitProxy),
    async close() {
      if (closed) return;
      closed = true;
      abortSignal.removeEventListener("abort", abort);
      await sandbox.terminate().catch((error) => {
        console.error("sandbox_termination_failed", {
          error,
          sandboxId: sandbox.sandboxId,
        });
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

function sandboxTools(sandbox: Sandbox, gitProxy: GitProxyConfig): ToolSet {
  return {
    sandbox_clone_pull_request: tool({
      description:
        "Clone a GitHub pull request through Tilde. Authentication is scoped to the clone/fetch processes and is never persisted.",
      inputSchema: z.object({
        baseRef: z
          .string()
          .refine(isSafeGitBranch, "baseRef must be a valid Git branch"),
        owner: z.string().regex(GITHUB_NAME),
        pullNumber: z.number().int().positive(),
        repo: z.string().regex(GITHUB_NAME),
      }),
      execute: async ({ baseRef, owner, pullNumber, repo }) => {
        const workdir = `/workspace/${repo}`;
        await requireSuccessfulCommand(
          sandbox,
          gitProxyCommand(gitProxy, [
            "clone",
            "--depth=1",
            "--branch",
            baseRef,
            "--no-checkout",
            `${gitProxy.proxyUrl}/${owner}/${repo}.git`,
            workdir,
          ]),
        );
        await requireSuccessfulCommand(
          sandbox,
          gitProxyCommand(gitProxy, [
            "-C",
            workdir,
            "fetch",
            "--depth=1",
            "origin",
            `+refs/pull/${pullNumber}/head:refs/remotes/origin/pull/${pullNumber}/head`,
          ]),
        );
        await requireSuccessfulCommand(sandbox, [
          "git",
          "-C",
          workdir,
          "checkout",
          "--detach",
          `refs/remotes/origin/pull/${pullNumber}/head`,
        ]);
        const head = await runCommand(sandbox, ["git", "rev-parse", "HEAD"], {
          workdir,
        });
        if (head.exitCode !== 0) {
          throw new Error(`Unable to resolve pull request HEAD: ${head.stderr}`);
        }
        return { baseRef, headSha: head.stdout.trim(), workdir };
      },
    }),
    sandbox_exec: tool({
      description: "Execute one bounded command in the review sandbox.",
      inputSchema: z.object({
        command: z.array(z.string().min(1)).min(1),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(MAX_COMMAND_TIMEOUT_MS)
          .optional(),
        workdir: workspacePath.optional(),
      }),
      execute: ({ command, timeoutMs, workdir }) =>
        runCommand(sandbox, command, { timeoutMs, workdir }),
    }),
    sandbox_list_files: tool({
      description: "List a directory in the review sandbox.",
      inputSchema: z.object({ path: workspacePath }),
      execute: ({ path }) => sandbox.filesystem.listFiles(path),
    }),
    sandbox_read_file: tool({
      description: "Read one UTF-8 file in the review sandbox.",
      inputSchema: z.object({ path: workspacePath }),
      execute: async ({ path }) =>
        truncateOutput(await sandbox.filesystem.readText(path)),
    }),
    sandbox_stat: tool({
      description: "Read metadata for a sandbox path.",
      inputSchema: z.object({ path: workspacePath }),
      execute: ({ path }) => sandbox.filesystem.stat(path),
    }),
  };
}

async function requireSuccessfulCommand(
  sandbox: Sandbox,
  command: string[],
): Promise<void> {
  const result = await runCommand(sandbox, command, {
    timeoutMs: MAX_COMMAND_TIMEOUT_MS,
    workdir: "/",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Sandbox command failed (${command[0]}): ${result.stderr || result.stdout}`,
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

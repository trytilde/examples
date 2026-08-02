import { reverseProxyPath, type Client } from "@trytilde/harness-sdk";
import type { ToolSet } from "ai";
import type { Env } from "@/lib/env";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const BOOTSTRAP_TIMEOUT_MS = 180 * 1000;

type ToolExecutionOptions = {
  abortSignal: AbortSignal;
  messages: [];
  toolCallId: string;
};
type ExecutableTool = {
  execute?: (input: Record<string, unknown>, options: ToolExecutionOptions) => Promise<unknown>;
};
type ModalResult = {
  content?: Array<{ text?: string; type?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};
type ModalExecResult = {
  exit_code: number;
  stderr: string;
  stdout: string;
  timed_out: boolean;
};

export type RemediationSandbox = {
  close(): Promise<void>;
  id: string;
  repositoryPath: string;
};

/** Create a Modal sandbox through Tilde's server-side MCP provider and clone the target repository. */
export async function createRemediationSandbox(
  env: Env,
  client: Client,
  tools: ToolSet,
  abortSignal: AbortSignal,
): Promise<RemediationSandbox> {
  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const gitProxyUrl = new URL(
    reverseProxyPath({
      profileId: env.TILDE_GITHUB_GIT_PROXY_PROFILE_ID,
      teamId: client.config.teamId,
    }),
    client.config.baseUrl,
  )
    .toString()
    .replace(/\/$/, "");
  const createTool = requireTool(tools, "modal_create_sandbox");
  const execTool = requireTool(tools, "modal_exec_command");
  const terminateTool = requireTool(tools, "modal_terminate_sandbox");
  const options: ToolExecutionOptions = {
    abortSignal,
    messages: [],
    toolCallId: `sentry-remediation-bootstrap-${crypto.randomUUID()}`,
  };

  let sandboxId: string | undefined;
  let closed = false;
  async function close() {
    if (closed || !sandboxId) return;
    closed = true;
    const cleanupOptions = {
      ...options,
      abortSignal: AbortSignal.timeout(30_000),
      toolCallId: `sentry-remediation-cleanup-${crypto.randomUUID()}`,
    };
    await invokeTool(terminateTool, { sandbox_id: sandboxId }, cleanupOptions).catch((error) =>
      console.error("Could not stop Modal sandbox.", error),
    );
  }

  try {
    const created = await invokeTool(
      createTool,
      { app_name: env.TILDE_MODAL_APP_NAME, timeout_ms: THIRTY_MINUTES_MS },
      options,
    );
    sandboxId = requiredString(created, "sandbox_id");
    await requireSuccess(
      execTool,
      sandboxId,
      "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git jq nodejs npm ripgrep && npm install --global pnpm@10 && rm -rf /var/lib/apt/lists/*",
      "/",
      options,
    );
    await requireSuccess(execTool, sandboxId, "mkdir -p /workspace", "/", options);
    await requireSuccess(
      execTool,
      sandboxId,
      `git config --global url.${shellQuote(`${gitProxyUrl}/`)}.insteadOf https://github.com/`,
      "/",
      options,
    );
    await requireSuccess(
      execTool,
      sandboxId,
      `git config --global --add http.${shellQuote(`${gitProxyUrl}/`)}.extraHeader ${shellQuote(`x-api-key: ${env.TILDE_API_KEY}`)}`,
      "/",
      options,
    );
    await requireSuccess(
      execTool,
      sandboxId,
      `git config --global --add http.${shellQuote(`${gitProxyUrl}/`)}.extraHeader ${shellQuote(`x-tilde-org-id: ${env.TILDE_ORG_ID}`)}`,
      "/",
      options,
    );
    const repositoryPath = `/workspace/${repo}`;
    await requireSuccess(
      execTool,
      sandboxId,
      `git clone ${shellQuote(`https://github.com/${owner}/${repo}.git`)} ${shellQuote(repositoryPath)}`,
      "/",
      options,
    );
    return { close, id: sandboxId, repositoryPath };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Hide lifecycle tools after bootstrap so the model cannot create or terminate unrelated sandboxes. */
export function agentRemediationTools(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).filter(
      ([name]) => name !== "modal_create_sandbox" && name !== "modal_terminate_sandbox",
    ),
  );
}

function requireTool(tools: ToolSet, name: string): ExecutableTool {
  const tool = tools[name] as ExecutableTool | undefined;
  if (!tool?.execute) throw new Error(`Required MCP tool is unavailable: ${name}`);
  return tool;
}

async function invokeTool(
  tool: ExecutableTool,
  input: Record<string, unknown>,
  options: ToolExecutionOptions,
): Promise<Record<string, unknown>> {
  if (!tool.execute) throw new Error("MCP tool does not have an executor");
  const raw = (await tool.execute(input, options)) as ModalResult;
  if (raw.isError) throw new Error(`Modal MCP tool failed: ${toolText(raw)}`);
  const value = raw.structuredContent ?? parseToolText(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Modal MCP tool returned an invalid result");
  }
  return value as Record<string, unknown>;
}

async function requireSuccess(
  tool: ExecutableTool,
  sandboxId: string,
  command: string,
  workdir: string,
  options: ToolExecutionOptions,
) {
  const result = (await invokeTool(
    tool,
    {
      cmd: command,
      sandbox_id: sandboxId,
      timeout_ms: BOOTSTRAP_TIMEOUT_MS,
      workdir,
    },
    options,
  )) as ModalExecResult;
  if (result.timed_out || result.exit_code !== 0) {
    throw new Error(`Sandbox command failed: ${result.stderr || result.stdout}`);
  }
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field) throw new Error(`Modal MCP result is missing ${key}`);
  return field;
}

function parseToolText(result: ModalResult): unknown {
  const text = toolText(result);
  return text ? JSON.parse(text) : undefined;
}

function toolText(result: ModalResult): string {
  return result.content?.find((part) => part.type === "text")?.text ?? "";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

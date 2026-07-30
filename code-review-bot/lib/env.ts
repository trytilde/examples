import { z } from "zod";

const required = z.string().trim().min(1);

const envSchema = z.object({
  OPENAI_API_KEY: required,
  OPENAI_MODEL: required.default("gpt-5.1"),
  TILDE_API_KEY: required,
  TILDE_BASE_URL: z.string().url().default("https://api.trytilde.ai"),
  TILDE_GITHUB_GIT_PROXY_PROFILE_ID: required,
  TILDE_MCP_SERVER_ID: required,
  TILDE_MODAL_APP_NAME: required.default("tilde-code-review"),
  TILDE_MODAL_PROXY_PROFILE_ID: required,
  TILDE_ORG_ID: required,
  TILDE_TEAM_ID: required,
  TILDE_WEBHOOK_SIGNING_KEY: required,
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

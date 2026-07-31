import { createClient } from "@trytilde/harness-sdk";
import { env } from "./env";

export const tilde = createClient({
  apiKey: env.TILDE_API_KEY,
  baseUrl: env.TILDE_BASE_URL,
  orgId: env.TILDE_ORG_ID,
  orgSubdomain: false,
  teamId: env.TILDE_TEAM_ID,
});

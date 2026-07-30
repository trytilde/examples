import { Metadata, type ClientMiddleware } from "nice-grpc";
import type { TildeConfig } from "./types";

export type TildeGrpcReverseProxy = {
  endpoint: string;
  middleware: ClientMiddleware;
};

export function createTildeGrpcReverseProxy(
  config: TildeConfig,
  profileId: string,
): TildeGrpcReverseProxy {
  return {
    endpoint: new URL(config.baseUrl).origin,
    middleware: async function* tildeGrpcReverseProxy(call, options) {
      const metadata = options.metadata ?? Metadata();
      metadata.set("x-api-key", config.apiKey);
      metadata.set("x-tilde-org-id", config.orgId);
      metadata.set("x-tilde-team-id", config.teamId);
      metadata.set("x-tilde-reverse-proxy-profile-id", profileId);
      return yield* call.next(call.request, { ...options, metadata });
    },
  };
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["tilde-harness-sdk"],
  serverExternalPackages: ["modal", "nice-grpc"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@tilde/api-client": "tilde-harness-sdk/packages/api-client/src/index.ts",
      "@tilde/harness-sdk": "tilde-harness-sdk/packages/core/src/index.ts",
      "@tilde/harness-sdk/api": "tilde-harness-sdk/packages/core/src/api.ts",
      "@tilde/harness-sdk-vercel-ai-node":
        "tilde-harness-sdk/packages/vercel-ai-node/src/index.ts",
    };
    return config;
  },
};

export default nextConfig;

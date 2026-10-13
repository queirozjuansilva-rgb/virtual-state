import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // System prompt do copiloto é lido do disco em runtime (src/lib/ai/prompts).
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/ai/prompts/*.md"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig

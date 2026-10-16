import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // O log de requisições do `next dev` imprime o caminho; o do link público tem o token.
  logging: { incomingRequests: { ignore: [/^\/r\//] } },
  partialPrefetching: true,
  // System prompt do copiloto é lido do disco em runtime (src/lib/ai/prompts).
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/ai/prompts/*.md"],
  },
  // Link público do relatório (/r/<token>): fora dos buscadores e sem Referer para
  // serviços externos, em toda resposta (página, 404 e PDF).
  async headers() {
    return [
      {
        source: "/r/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
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

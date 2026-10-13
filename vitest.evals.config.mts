import path from "node:path"

import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

/** Evals do copiloto com o modelo real (npm run evals). Lê a chave do .env.local. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.eval.ts"],
    env: loadEnv("", process.cwd(), ""),
    testTimeout: 30 * 60 * 1000,
  },
})

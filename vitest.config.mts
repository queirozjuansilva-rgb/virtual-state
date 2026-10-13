import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/supabase/**", "**/*.test.ts", "**/*.test-utils.ts"],
      // Aceite da Fase 2: motor e DSL de fórmulas com cobertura ≥ 90%.
      thresholds: {
        "src/lib/feasibility/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/lib/formula/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
})

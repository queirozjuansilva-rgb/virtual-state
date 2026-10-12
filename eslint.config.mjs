import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Motor de viabilidade e DSL de fórmulas: TypeScript puro e determinístico.
    // Nada de framework, banco, rede ou IA aqui dentro (ver docs/adr/0001).
    files: ["src/lib/feasibility/**/*.ts", "src/lib/formula/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "@supabase/*",
                "@anthropic-ai/*",
                "@/*",
              ],
              message:
                "O motor é puro: importe só módulos relativos dentro de src/lib/feasibility ou src/lib/formula.",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", "fetch", "eval"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "O motor precisa ser determinístico." },
        { object: "Date", property: "now", message: "Receba datas como input do motor." },
      ],
    },
  },
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
])

export default eslintConfig

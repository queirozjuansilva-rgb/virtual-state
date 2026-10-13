import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * System prompt versionado (PRD, Módulo 5). Mudar o texto = nova versão
 * (copiloto.v2.md) + evals; o prompt fica congelado durante a conversa para
 * preservar o cache e o raciocínio entre turnos. O arquivo .md entra no bundle
 * do servidor via outputFileTracingIncludes (next.config.ts).
 */
export const VERSAO_PROMPT = "copiloto.v3"

let texto: string | null = null

export function promptCopiloto(): string {
  texto ??= readFileSync(
    path.join(process.cwd(), "src/lib/ai/prompts", `${VERSAO_PROMPT}.md`),
    "utf8",
  ).trim()
  return texto
}

import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

/**
 * Configuração do copiloto (ADR 0009). A chave da Anthropic existe só no
 * servidor; o modelo e o esforço vêm de variáveis de ambiente.
 */
const configSchema = z.object({
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  COPILOTO_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  COPILOTO_MAX_TOKENS: z.coerce.number().int().min(1024).max(128_000).default(16_000),
})

export const configCopiloto = configSchema.parse({
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || undefined,
  COPILOTO_EFFORT: process.env.COPILOTO_EFFORT || undefined,
  COPILOTO_MAX_TOKENS: process.env.COPILOTO_MAX_TOKENS || undefined,
})

/**
 * Betas usados no copiloto:
 * - server-side-fallback-2026-07-01: `fallbacks: "default"` refaz recusas de
 *   classificador em outro modelo, no servidor;
 * - thinking-display-updates-2026-08-18: `display: "updates"` devolve as notas
 *   de progresso entre chamadas de ferramenta;
 * - thinking-binding-controls-2026-08-01: `prefix_mismatch_behavior` explícito
 *   (histórico append-only; se algo mudar, degrada em vez de falhar).
 */
export const BETAS_COPILOTO = [
  "server-side-fallback-2026-07-01",
  "thinking-display-updates-2026-08-18",
  "thinking-binding-controls-2026-08-01",
]

/** Limite de idas e voltas modelo → ferramentas num único turno do usuário. */
export const MAX_PASSOS_POR_TURNO = 8

export function temChaveAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

let cliente: Anthropic | null = null

export function clienteAnthropic(): Anthropic {
  cliente ??= new Anthropic()
  return cliente
}

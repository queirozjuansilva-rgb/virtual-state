import "server-only"

import { z } from "zod"

/**
 * Configuração da ingestão normativa (ADR 0011). Modelos trocáveis por
 * variável de ambiente; preços para estimar o custo mostrado ao admin antes
 * de rodar OCR ou extração.
 */
const schema = z.object({
  // OCR é transcrição: o modelo do copiloto basta, sem raciocínio estendido.
  INGESTAO_OCR_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  // Extração: precisão importa mais que custo (volume baixo, só admin).
  INGESTAO_EXTRACAO_MODEL: z.string().min(1).default("claude-opus-5-5"),
  VOYAGE_MODEL: z.string().min(1).default("voyage-4"),
})

export const configIngestao = schema.parse({
  INGESTAO_OCR_MODEL: process.env.INGESTAO_OCR_MODEL || undefined,
  INGESTAO_EXTRACAO_MODEL: process.env.INGESTAO_EXTRACAO_MODEL || undefined,
  VOYAGE_MODEL: process.env.VOYAGE_MODEL || undefined,
})

/** Dimensão da coluna legal_chunks.embedding. */
export const DIMENSAO_EMBEDDING = 1024

export function temChaveVoyage(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY)
}

/** US$ por milhão de tokens (entrada, saída). Modelo fora da tabela: sem estimativa. */
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "claude-sonnet-5-5": { entrada: 2, saida: 10 },
  "claude-opus-5-5": { entrada: 4, saida: 20 },
}

export function custoUsd(modelo: string, entrada: number, saida: number): number | null {
  const p = PRECOS[modelo]
  if (!p) return null
  return Number(((entrada * p.entrada + saida * p.saida) / 1_000_000).toFixed(4))
}

/**
 * Estimativa para a tela, antes de rodar: uma página escaneada de lei custa
 * ~1.700 tokens de imagem na entrada e ~1.700 de texto na saída (medido na LC
 * 62/2009: US$ 0,021 por página com o Sonnet 5.5).
 */
export function estimarCustoOcr(paginas: number): number | null {
  return custoUsd(configIngestao.INGESTAO_OCR_MODEL, paginas * 1_700 + 1_000, paginas * 1_700)
}

/**
 * Extração: ~4.000 tokens fixos (instruções) + ~3.500 por página de texto na
 * entrada; ~2.600 de saída por página (raciocínio + JSON). Medido na LC
 * 62/2009: 6 páginas → 25,5 mil de entrada e 15,8 mil de saída (US$ 0,42).
 */
export function estimarCustoExtracao(paginas: number): number | null {
  return custoUsd(configIngestao.INGESTAO_EXTRACAO_MODEL, 4_000 + paginas * 3_500, paginas * 2_600)
}

/** Parâmetros da estimativa, para a tela calcular enquanto o admin digita as páginas. */
export function parametrosEstimativaExtracao(): { fixo: number; porPagina: number } | null {
  const um = estimarCustoExtracao(1)
  const dois = estimarCustoExtracao(2)
  if (um === null || dois === null) return null
  return { fixo: Number((um - (dois - um)).toFixed(4)), porPagina: Number((dois - um).toFixed(4)) }
}

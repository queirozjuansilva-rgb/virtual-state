import type { EntradaViabilidade, ResultadoViabilidade, Uso } from "@/lib/feasibility"

/** Contexto de um estudo: o que a entrada do motor não guarda (referência e local). */
export type ContextoEstudo = {
  /** Código do terreno ou "Ponto -3.74000, -38.49800". */
  referencia: string
  uso: Uso
  /** Estudo fora do land bank: ponto informado pelo usuário. */
  ponto?: { longitude: number; latitude: number } | null
}

export type VersaoRelatorio = {
  id: string
  versao: number
  entrada: EntradaViabilidade
  resultado: ResultadoViabilidade
  versaoMotor: string
  salvaEm: string
}

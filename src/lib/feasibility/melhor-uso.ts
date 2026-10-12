import type { ResultadoViabilidade, Uso } from "./types"

/**
 * Etapa G: melhor uso recomendado (ADR 0007). Recebe o resultado do motor para
 * cada uso candidato (os permitidos na zona) e ranqueia pela TIR anual do
 * cenário base ajustada ao risco: índice = TIR anual × (1 − score ÷ 100).
 * Empate: maior margem sobre o VGV. O LLM só redige a justificativa a partir
 * deste ranking; não escolhe.
 */
export type CandidatoRanqueado = {
  uso: Uso
  elegivel: boolean
  indice: number | null
  tirAnual: number | null
  margemVgv: number | null
  scoreRisco: number
  motivo: string
}

export function ranquearUsos(resultados: readonly ResultadoViabilidade[]): CandidatoRanqueado[] {
  const candidatos = resultados.map((r): CandidatoRanqueado => {
    const metricas = r.base?.metricas ?? null
    const base = {
      uso: r.uso,
      tirAnual: metricas?.tirAnual ?? null,
      margemVgv: metricas?.margemVgv ?? null,
      scoreRisco: r.risco.score,
    }
    if (r.status === "uso_nao_permitido") {
      return { ...base, elegivel: false, indice: null, motivo: "Uso não permitido na zona." }
    }
    if (r.status !== "ok" || metricas === null) {
      return {
        ...base,
        elegivel: false,
        indice: null,
        motivo: "Estudo incompleto (faltam parâmetros).",
      }
    }
    if (metricas.lucro <= 0) {
      return {
        ...base,
        elegivel: false,
        indice: null,
        motivo: "Resultado negativo no cenário base.",
      }
    }
    if (metricas.tirAnual === null) {
      return { ...base, elegivel: false, indice: null, motivo: "TIR indeterminada para o fluxo." }
    }
    return {
      ...base,
      elegivel: true,
      indice: metricas.tirAnual * (1 - r.risco.score / 100),
      motivo: "Elegível.",
    }
  })

  return candidatos.sort((a, b) => {
    if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1
    if (a.indice !== null && b.indice !== null && Math.abs(a.indice - b.indice) > 1e-12) {
      return b.indice - a.indice
    }
    return (b.margemVgv ?? -Infinity) - (a.margemVgv ?? -Infinity)
  })
}

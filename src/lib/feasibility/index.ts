import { DISCLAIMER, ROTULOS_PREMISSAS } from "./defaults"
import { calcularFinanceiro } from "./financeiro"
import { calcularPotencial } from "./potencial"
import { avaliarRisco } from "./risco"
import type {
  ChavePremissa,
  DeltasCenario,
  EntradaViabilidade,
  NomeCenario,
  PremissaUsada,
  ResultadoFinanceiro,
  ResultadoViabilidade,
  ResumoCenario,
  StatusResultado,
} from "./types"
import { ENGINE_VERSION } from "./version"

export * from "./types"
export { ENGINE_VERSION } from "./version"
export {
  CENARIOS_PADRAO,
  DISCLAIMER,
  PREMISSAS_PADRAO,
  RISCO_PADRAO,
  ROTULOS_PREMISSAS,
} from "./defaults"
export { estatisticaComparaveis } from "./precos"
export { ranquearUsos, type CandidatoRanqueado } from "./melhor-uso"
export { premissasSchema } from "./schema"
export { nivelRisco } from "./risco"

const SEM_DELTA: DeltasCenario = { preco: 0, custo: 0, prazoVendas: 0 }

/**
 * Motor de viabilidade (Módulo 4 do PRD, ADR 0007). Função pura: mesma
 * entrada, mesma saída. O LLM nunca calcula números; ele chama esta função.
 */
export function calcularViabilidade(entrada: EntradaViabilidade): ResultadoViabilidade {
  const { terreno, regra, mercado, premissas } = entrada
  const pendencias: string[] = []
  const avisos: string[] = []

  let status: StatusResultado = "ok"
  let potencial: ResultadoViabilidade["potencial"] = null
  let base: ResultadoFinanceiro | null = null
  const cenarios: ResumoCenario[] = []

  if (regra.status === "ausente") {
    status = "incompleto"
    pendencias.push("Não há regra urbanística validada para este uso na zona do lote.")
  } else if (!regra.permitido) {
    status = "uso_nao_permitido"
    pendencias.push("O uso não é permitido na zona segundo a regra validada.")
  } else {
    const resultadoPotencial = calcularPotencial(terreno, regra, premissas)
    pendencias.push(...resultadoPotencial.pendencias)
    avisos.push(...resultadoPotencial.avisos)
    potencial = resultadoPotencial.potencial
    if (potencial === null) status = "incompleto"
  }

  if (potencial !== null) {
    const rodar = (nome: NomeCenario, deltas: DeltasCenario) => {
      const { resultado, avisos: avisosCenario } = calcularFinanceiro({
        potencial: potencial!,
        areaTerrenoM2: terreno.areaM2,
        precoVendaM2: mercado.precoVendaM2,
        outorgaFator: regra.outorgaFator,
        premissas,
        deltas,
      })
      if (nome === "base") avisos.push(...avisosCenario)
      cenarios.push({ cenario: nome, deltas, metricas: resultado.metricas })
      return resultado
    }
    rodar("conservador", entrada.cenarios.conservador)
    base = rodar("base", SEM_DELTA)
    rodar("otimista", entrada.cenarios.otimista)
  }

  const conservador = cenarios.find((c) => c.cenario === "conservador")
  const risco = avaliarRisco(
    {
      terreno,
      regra,
      mercado,
      premissas,
      potencial,
      margemConservador: conservador?.metricas.margemVgv ?? null,
    },
    entrada.risco,
  )

  return {
    versaoMotor: ENGINE_VERSION,
    uso: regra.uso,
    status,
    pendencias,
    avisos,
    potencial,
    base,
    cenarios,
    risco,
    premissas: listarPremissas(entrada),
    disclaimer: DISCLAIMER,
  }
}

/** Premissas efetivamente usadas, cada uma com a sua fonte. */
function listarPremissas(entrada: EntradaViabilidade): PremissaUsada[] {
  const preco: PremissaUsada = {
    chave: "precoVendaM2",
    rotulo: "Preço de venda (privativo)",
    unidade: "R$/m²",
    valor: entrada.mercado.precoVendaM2,
    fonte: entrada.mercado.fontePreco,
  }
  return [
    preco,
    ...(Object.keys(ROTULOS_PREMISSAS) as ChavePremissa[]).map((chave) => ({
      chave,
      ...ROTULOS_PREMISSAS[chave],
      valor: entrada.premissas[chave],
      fonte: entrada.fontes[chave] ?? { tipo: "default_calibrado" as const, chave },
    })),
  ]
}

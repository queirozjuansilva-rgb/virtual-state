import { evaluateFormula, FormulaError, parseFormula, type Expr } from "../formula"

import type { Potencial, Premissas, RegraUrbanistica, Terreno } from "./types"

/** Teto de pavimentos quando a regra não traz gabarito (sinalizado como aviso). */
export const MAX_PAVIMENTOS_SEM_GABARITO = 40

const EPS = 1e-9

export type ResultadoPotencial = {
  potencial: Potencial | null
  pendencias: string[]
  avisos: string[]
}

type Premissa = Pick<
  Premissas,
  | "usarCaMaximo"
  | "peDireitoM"
  | "eficiencia"
  | "areaNaoComputavelPct"
  | "equivalenciaNaoComputavel"
>

/**
 * Etapa A: potencial construtivo (ADR 0007).
 *
 * Aproximação retangular: lote = testada × profundidade (área ÷ testada). A
 * projeção do pavimento-tipo é o menor entre TO × área e o retângulo que sobra
 * após os recuos. Recuos podem depender da altura (H), então o número de
 * pavimentos é escolhido iterando de 1 até o gabarito: o menor n que atinge a
 * área computável do CA; se nenhum atinge, o n de maior capacidade.
 */
export function calcularPotencial(
  terreno: Terreno,
  regra: RegraUrbanistica,
  premissas: Premissa,
): ResultadoPotencial {
  const pendencias: string[] = []
  const avisos: string[] = []
  const area = terreno.areaM2

  if (!(area > 0)) pendencias.push("Área do terreno não informada.")
  if (regra.caBasico === null) pendencias.push("CA básico não validado para este uso na zona.")
  if (!(premissas.peDireitoM > 0)) pendencias.push("Pé-direito inválido.")

  const recuos = {
    frontal: compilarRecuo("frontal", regra.recuoFrontal, avisos, pendencias),
    lateral: compilarRecuo("lateral", regra.recuoLateral, avisos, pendencias),
    fundos: compilarRecuo("de fundos", regra.recuoFundos, avisos, pendencias),
  }

  if (pendencias.length > 0 || regra.caBasico === null) {
    return { potencial: null, pendencias, avisos }
  }

  // Geometria aproximada
  const testadaEstimada = !(terreno.testadaM !== null && terreno.testadaM > 0)
  const testada = testadaEstimada ? Math.sqrt(area) : (terreno.testadaM as number)
  if (testadaEstimada) {
    avisos.push("Testada não informada: lote estimado como quadrado (√área).")
  }
  const profundidade = area / testada
  avisos.push("Projeção estimada por aproximação retangular (testada × profundidade).")

  // Coeficiente de aproveitamento
  let caAplicado = regra.caBasico
  if (premissas.usarCaMaximo) {
    if (regra.caMaximo !== null) caAplicado = regra.caMaximo
    else avisos.push("CA máximo não validado: usado o CA básico.")
  }
  const usaOutorga = caAplicado > regra.caBasico + EPS
  const alvo = area * caAplicado

  // Taxa de ocupação
  const projecaoMaxTO = regra.toMax !== null ? area * regra.toMax : null
  if (projecaoMaxTO === null) {
    avisos.push("Taxa de ocupação não validada: projeção limitada só pelos recuos.")
  }

  // Gabarito
  const limites: number[] = []
  if (regra.gabaritoPavimentos !== null) limites.push(regra.gabaritoPavimentos)
  if (regra.gabaritoM !== null)
    limites.push(Math.floor(regra.gabaritoM / premissas.peDireitoM + EPS))
  let maxPavimentos = limites.length > 0 ? Math.min(...limites) : MAX_PAVIMENTOS_SEM_GABARITO
  if (limites.length === 0) {
    avisos.push(
      `Gabarito não validado: considerado o teto técnico de ${MAX_PAVIMENTOS_SEM_GABARITO} pavimentos.`,
    )
  }
  maxPavimentos = Math.max(0, maxPavimentos)
  if (maxPavimentos < 1) {
    return {
      potencial: null,
      pendencias: ["O gabarito não comporta nem um pavimento com o pé-direito adotado."],
      avisos,
    }
  }

  type Opcao = {
    n: number
    altura: number
    r: { frontal: number; lateral: number; fundos: number }
    projecaoRecuos: number
    projecao: number
    capacidade: number
  }
  const opcoes: Opcao[] = []
  for (let n = 1; n <= maxPavimentos; n++) {
    const altura = n * premissas.peDireitoM
    const vars = { H: altura, P: n, A: area, T: testada }
    let r: Opcao["r"]
    try {
      r = {
        frontal: Math.max(0, recuos.frontal ? evaluateFormula(recuos.frontal, vars) : 0),
        lateral: Math.max(0, recuos.lateral ? evaluateFormula(recuos.lateral, vars) : 0),
        fundos: Math.max(0, recuos.fundos ? evaluateFormula(recuos.fundos, vars) : 0),
      }
    } catch (error) {
      const motivo = error instanceof FormulaError ? error.message : "erro de cálculo"
      return {
        potencial: null,
        pendencias: [`Não foi possível calcular os recuos com ${n} pavimento(s): ${motivo}`],
        avisos,
      }
    }
    // Lote de esquina: um dos lados vira frente (recuo frontal no lugar de um lateral).
    const largura = terreno.esquina ? testada - r.lateral - r.frontal : testada - 2 * r.lateral
    const fundo = profundidade - r.frontal - r.fundos
    const projecaoRecuos = Math.max(0, largura) * Math.max(0, fundo)
    const projecao =
      projecaoMaxTO === null ? projecaoRecuos : Math.min(projecaoMaxTO, projecaoRecuos)
    opcoes.push({ n, altura, r, projecaoRecuos, projecao, capacidade: projecao * n })
  }

  const atinge = opcoes.find((o) => o.capacidade >= alvo - EPS)
  const melhor =
    atinge ?? opcoes.reduce((a, b) => (b.capacidade > a.capacidade + EPS ? b : a), opcoes[0]!)

  if (melhor.capacidade <= EPS) {
    return {
      potencial: null,
      pendencias: ["Os recuos não deixam área edificável no lote."],
      avisos,
    }
  }

  const areaComputavel = atinge ? alvo : melhor.capacidade
  const limitante: Potencial["limitante"] = atinge
    ? "coeficiente_aproveitamento"
    : melhor.n === maxPavimentos
      ? "gabarito"
      : "recuos"
  const projecaoLimitadaPor =
    projecaoMaxTO !== null && projecaoMaxTO <= melhor.projecaoRecuos + EPS
      ? "taxa_ocupacao"
      : "recuos"

  const areaNaoComputavel = areaComputavel * premissas.areaNaoComputavelPct

  return {
    potencial: {
      testadaM: testada,
      profundidadeM: profundidade,
      testadaEstimada,
      caAplicado,
      usaOutorga,
      areaComputavelAlvoM2: alvo,
      areaComputavelM2: areaComputavel,
      pavimentos: melhor.n,
      alturaM: melhor.altura,
      recuosM: melhor.r,
      projecaoMaxTOM2: projecaoMaxTO,
      projecaoRecuosM2: melhor.projecaoRecuos,
      projecaoM2: melhor.projecao,
      limitante,
      projecaoLimitadaPor,
      areaAdicionalOutorgaM2: Math.max(0, areaComputavel - area * regra.caBasico),
      areaNaoComputavelM2: areaNaoComputavel,
      areaConstruidaTotalM2: areaComputavel + areaNaoComputavel,
      areaEquivalenteM2: areaComputavel + areaNaoComputavel * premissas.equivalenciaNaoComputavel,
      areaPrivativaM2: areaComputavel * premissas.eficiencia,
    },
    pendencias,
    avisos,
  }
}

function compilarRecuo(
  nome: string,
  expressao: string | null,
  avisos: string[],
  pendencias: string[],
): Expr | null {
  if (expressao === null || expressao.trim() === "") {
    avisos.push(`Recuo ${nome} não validado: considerado 0 m.`)
    return null
  }
  try {
    return parseFormula(expressao)
  } catch (error) {
    const motivo = error instanceof FormulaError ? error.message : "expressão inválida"
    pendencias.push(`Recuo ${nome} com fórmula inválida (${motivo}).`)
    return null
  }
}

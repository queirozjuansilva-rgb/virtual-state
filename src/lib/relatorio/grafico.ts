import type { MesFluxo } from "@/lib/feasibility"

/**
 * Geometria do gráfico de fluxo de caixa acumulado (cenário base). Pura: a
 * página (SVG) e o PDF (react-pdf) desenham a partir do mesmo resultado.
 */

export type Margens = { topo: number; direita: number; base: number; esquerda: number }

export type GeometriaFluxo = {
  largura: number
  altura: number
  margens: Margens
  /** Linha do acumulado, comando "d" de path SVG. */
  caminho: string
  /** Área entre a linha e o zero (preenchimento). */
  area: string
  zeroY: number
  pontos: { mes: number; acumulado: number; x: number; y: number }[]
  ticksY: { valor: number; y: number }[]
  ticksX: { mes: number; x: number; rotulo: string }[]
  /** Maior necessidade de caixa (menor acumulado). */
  minimo: { mes: number; acumulado: number; x: number; y: number } | null
  /** Primeiro mês em que o acumulado volta a ser ≥ 0 depois de negativo. */
  payback: { mes: number; x: number } | null
}

const MARGENS_PADRAO: Margens = { topo: 12, direita: 12, base: 24, esquerda: 64 }

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para ~`alvo` divisões do intervalo. */
export function passoRedondo(intervalo: number, alvo = 4): number {
  if (!(intervalo > 0)) return 1
  const bruto = intervalo / alvo
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const fator = bruto / potencia
  const redondo = fator <= 1 ? 1 : fator <= 2 ? 2 : fator <= 2.5 ? 2.5 : fator <= 5 ? 5 : 10
  return redondo * potencia
}

export function geometriaFluxo(
  fluxo: readonly MesFluxo[],
  largura: number,
  altura: number,
  margens: Margens = MARGENS_PADRAO,
): GeometriaFluxo {
  const internoL = largura - margens.esquerda - margens.direita
  const internoA = altura - margens.topo - margens.base
  const valores = fluxo.map((m) => m.acumulado)
  const passo = passoRedondo(Math.max(...valores, 0) - Math.min(...valores, 0))
  const minY = Math.floor(Math.min(...valores, 0) / passo) * passo
  const maxY = Math.ceil(Math.max(...valores, 0) / passo) * passo || passo
  const ultimoMes = Math.max(fluxo.at(-1)?.mes ?? 1, 1)

  const x = (mes: number) => margens.esquerda + (mes / ultimoMes) * internoL
  const y = (v: number) => margens.topo + ((maxY - v) / (maxY - minY)) * internoA
  const arred = (n: number) => Math.round(n * 10) / 10

  const pontos = fluxo.map((m) => ({
    mes: m.mes,
    acumulado: m.acumulado,
    x: arred(x(m.mes)),
    y: arred(y(m.acumulado)),
  }))
  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  const zeroY = arred(y(0))
  const area = pontos.length
    ? `${caminho} L${pontos.at(-1)!.x},${zeroY} L${pontos[0].x},${zeroY} Z`
    : ""

  const ticksY: GeometriaFluxo["ticksY"] = []
  for (let v = minY; v <= maxY + passo / 2; v += passo) ticksY.push({ valor: v, y: arred(y(v)) })

  const passoMeses = ultimoMes > 48 ? 12 : ultimoMes > 24 ? 6 : 3
  const ticksX: GeometriaFluxo["ticksX"] = []
  for (let mes = 0; mes <= ultimoMes; mes += passoMeses) {
    ticksX.push({ mes, x: arred(x(mes)), rotulo: passoMeses === 12 ? `Ano ${mes / 12}` : `${mes}` })
  }

  const minimo = pontos.reduce<GeometriaFluxo["minimo"]>(
    (menor, p) => (menor === null || p.acumulado < menor.acumulado ? p : menor),
    null,
  )
  let payback: GeometriaFluxo["payback"] = null
  let jaNegativo = false
  for (const p of pontos) {
    if (p.acumulado < 0) jaNegativo = true
    else if (jaNegativo) {
      payback = { mes: p.mes, x: p.x }
      break
    }
  }

  return {
    largura,
    altura,
    margens,
    caminho,
    area,
    zeroY,
    pontos,
    ticksY,
    ticksX,
    minimo: minimo && minimo.acumulado < 0 ? minimo : null,
    payback,
  }
}

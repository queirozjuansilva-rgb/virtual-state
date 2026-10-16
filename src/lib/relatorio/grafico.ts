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

// Rótulos --------------------------------------------------------------------------------

export type Ancora = "start" | "middle" | "end"

/** Texto posicionado: `x` conforme a âncora; `y` é a linha de base (eixo X) ou o centro (eixo Y). */
export type Rotulo = { texto: string; x: number; y: number; ancora: Ancora }

/** Distância mínima entre um texto e a borda do desenho. */
const FOLGA = 2

/**
 * Largura estimada de um texto em fonte sem serifa. 0,6 em por caractere fica
 * acima da média real (dígitos e "R$" têm ~0,55 em), então erra para sobrar.
 */
export function larguraTexto(texto: string, fonte: number): number {
  return Math.ceil(texto.length * fonte * 0.6)
}

/** Extremos horizontais de um texto com a âncora dada. */
export function extensaoRotulo(r: Rotulo, fonte: number): { esquerda: number; direita: number } {
  const w = larguraTexto(r.texto, fonte)
  const esquerda = r.ancora === "start" ? r.x : r.ancora === "end" ? r.x - w : r.x - w / 2
  return { esquerda, direita: esquerda + w }
}

/** Mantém o texto entre `min` e `max`, o mais perto possível de `x`. */
function encaixar(
  texto: string,
  x: number,
  fonte: number,
  ancora: Ancora,
  min: number,
  max: number,
): { x: number; ancora: Ancora } {
  const { esquerda, direita } = extensaoRotulo({ texto, x, y: 0, ancora }, fonte)
  if (esquerda < min) return { x: min, ancora: "start" }
  if (direita > max) return { x: max, ancora: "end" }
  return { x, ancora }
}

export type OpcoesLayout = {
  /** Tamanho da fonte dos rótulos, na mesma unidade da largura (px na tela, pt no PDF). */
  fonte: number
  /** Texto de um valor do eixo Y (ex.: "R$ 2 mi"). */
  rotuloValor: (valor: number) => string
  /** Rótulo da exposição máxima, do mais completo ao mais curto; usa o primeiro que couber. */
  rotulosExposicao?: (minimo: { mes: number; acumulado: number }) => string[]
  rotuloPayback?: (mes: number) => string
  /** Margens mínimas; a esquerda cresce para caber o maior valor do eixo Y. */
  margens?: Partial<Margens>
}

export type LayoutFluxo = GeometriaFluxo & {
  fonte: number
  rotulosY: Rotulo[]
  rotulosX: Rotulo[]
  rotuloExposicao: Rotulo | null
  rotuloPayback: Rotulo | null
}

/**
 * Geometria + rótulos que cabem inteiros no desenho, em qualquer largura: a
 * margem esquerda acompanha os valores do eixo Y, os meses do eixo X são
 * espaçados quando não cabem e os das pontas não passam da borda, e os rótulos
 * de exposição e payback trocam de lado (ou encurtam) perto das bordas.
 */
export function layoutFluxo(
  fluxo: readonly MesFluxo[],
  largura: number,
  altura: number,
  opcoes: OpcoesLayout,
): LayoutFluxo {
  const { fonte } = opcoes
  const minimas: Margens = { ...MARGENS_PADRAO, ...opcoes.margens }
  const distanciaEixo = Math.max(4, Math.round(fonte * 0.7))

  // Os valores do eixo Y não dependem das margens: a prévia só mede o maior texto.
  const previa = geometriaFluxo(fluxo, largura, altura, minimas)
  const maiorY = Math.max(
    0,
    ...previa.ticksY.map((t) => larguraTexto(opcoes.rotuloValor(t.valor), fonte)),
  )
  const esquerda = Math.max(minimas.esquerda, maiorY + distanciaEixo + FOLGA)
  const g =
    esquerda === minimas.esquerda
      ? previa
      : geometriaFluxo(fluxo, largura, altura, { ...minimas, esquerda })
  const { margens } = g
  const baseGrafico = altura - margens.base
  const maxX = largura - FOLGA

  const rotulosY: Rotulo[] = g.ticksY.map((t) => ({
    texto: opcoes.rotuloValor(t.valor),
    x: margens.esquerda - distanciaEixo,
    y: t.y,
    ancora: "end",
  }))

  // Eixo X: pula meses até sobrar espaço entre os rótulos; as pontas ficam dentro da borda.
  const larguraX = Math.max(0, ...g.ticksX.map((t) => larguraTexto(t.rotulo, fonte)))
  const espaco = g.ticksX.length > 1 ? g.ticksX[1].x - g.ticksX[0].x : Infinity
  const salto = Math.max(1, Math.ceil((larguraX + fonte) / espaco))
  const yEixoX = altura - Math.max(4, Math.round(fonte * 0.5))
  const rotulosX: Rotulo[] = g.ticksX
    .filter((_, i) => i % salto === 0)
    .map((t) => ({
      texto: t.rotulo,
      y: yEixoX,
      ...encaixar(t.rotulo, t.x, fonte, "middle", FOLGA, maxX),
    }))

  let rotuloExposicao: Rotulo | null = null
  if (g.minimo && opcoes.rotulosExposicao) {
    const m = g.minimo
    const min = margens.esquerda
    const texto = opcoes.rotulosExposicao(m).find((t) => larguraTexto(t, fonte) <= maxX - min)
    if (texto) {
      const w = larguraTexto(texto, fonte)
      const afastamento = fonte * 0.75
      const posicao: { x: number; ancora: Ancora } =
        m.x + afastamento + w <= maxX
          ? { x: m.x + afastamento, ancora: "start" }
          : m.x - afastamento - w >= min
            ? { x: m.x - afastamento, ancora: "end" }
            : encaixar(texto, m.x, fonte, "middle", min, maxX)
      // Abaixo do ponto se couber antes dos meses do eixo X; senão, acima.
      const abaixo = m.y + fonte + 3
      const y = abaixo <= baseGrafico - 2 ? abaixo : m.y - fonte * 0.75
      rotuloExposicao = { texto, y, ...posicao }
    }
  }

  let rotuloPayback: Rotulo | null = null
  if (g.payback && opcoes.rotuloPayback) {
    const texto = opcoes.rotuloPayback(g.payback.mes)
    const w = larguraTexto(texto, fonte)
    const afastamento = fonte * 0.5
    const posicao: { x: number; ancora: Ancora } =
      g.payback.x - afastamento - w >= margens.esquerda
        ? { x: g.payback.x - afastamento, ancora: "end" }
        : encaixar(texto, g.payback.x + afastamento, fonte, "start", margens.esquerda, maxX)
    rotuloPayback = { texto, y: margens.topo + fonte, ...posicao }
  }

  return { ...g, fonte, rotulosY, rotulosX, rotuloExposicao, rotuloPayback }
}

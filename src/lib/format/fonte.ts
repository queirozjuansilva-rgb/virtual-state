import type { Fonte, PremissaUsada } from "@/lib/feasibility"

import { formatBRL, formatDate, formatMonthYear, formatNumber, formatPercent } from "./index"

/** Fonte de um número em texto, para tooltip/rodapé (princípio 3 do PRD). */
export function formatarFonte(fonte: Fonte): string {
  switch (fonte.tipo) {
    case "lei":
      return `${fonte.documento}, ${fonte.artigo}${fonte.ficticio ? " (lei fictícia)" : ""}`
    case "cub":
      return `CUB ${fonte.padrao}/${fonte.uf} de ${formatMonthYear(`${fonte.mesReferencia}-01`)} (${fonte.origem})`
    case "comparaveis":
      return `Mediana de ${fonte.n} comparáveis (${fonte.tipologia.replace("_", " ")}) num raio de ${formatNumber(fonte.raioM, 0)} m, desde ${formatDate(fonte.desde)}${fonte.ficticio ? " (fictícios)" : ""}`
    case "dado_terreno":
      return `Cadastro do terreno (${fonte.campo})${fonte.observacao ? `: ${fonte.observacao}` : ""}`
    case "premissa_usuario":
      return fonte.observacao ? `Premissa do usuário: ${fonte.observacao}` : "Premissa do usuário"
    case "default_calibrado":
      if (!fonte.observacao) return "Default da plataforma"
      return fonte.observacao.startsWith("Default")
        ? fonte.observacao
        : `Default da plataforma: ${fonte.observacao}`
  }
}

const VALORES_TEXTO: Record<string, string> = {
  compra: "Compra",
  permuta_fisica: "Permuta física",
  permuta_financeira: "Permuta financeira",
  misto: "Misto (dinheiro + permuta)",
  linear: "Linear",
  s: "Curva S",
}

/** Valor de uma premissa com a unidade, em pt-BR. */
export function formatarValorPremissa(p: Pick<PremissaUsada, "valor" | "unidade">): string {
  const { valor, unidade } = p
  if (typeof valor === "boolean") return valor ? "Sim" : "Não"
  if (typeof valor === "string") return VALORES_TEXTO[valor] ?? valor
  switch (unidade) {
    case "%":
      return formatPercent(valor, 2)
    case "R$":
      return formatBRL(valor)
    case "R$/m²":
      return `${formatBRL(valor)}/m²`
    case "meses":
      return `${formatNumber(valor, 0)} ${valor === 1 ? "mês" : "meses"}`
    case "m":
      return `${formatNumber(valor)} m`
    default:
      return formatNumber(valor)
  }
}

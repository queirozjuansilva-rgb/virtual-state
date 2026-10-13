import type {
  CampoRegra,
  EntradaViabilidade,
  Metricas,
  ResultadoViabilidade,
  TipoRestricao,
} from "@/lib/feasibility"
import { formatArea, formatBRL, formatNumber, formatPercent } from "@/lib/format"
import { formatarFonte } from "@/lib/format/fonte"

/**
 * Seções do relatório em texto pt-BR, sem UI: a página, o link compartilhado
 * e o PDF mostram exatamente as mesmas linhas.
 */

const ORDEM_CENARIOS = ["conservador", "base", "otimista"] as const

const LINHAS_CENARIOS: [string, (m: Metricas) => string][] = [
  ["VGV", (m) => formatBRL(m.vgv, { compact: true })],
  ["Custo total", (m) => formatBRL(m.custoTotal, { compact: true })],
  ["Lucro", (m) => formatBRL(m.lucro, { compact: true })],
  ["Margem líquida", (m) => formatPercent(m.margemVgv)],
  ["ROI", (m) => formatPercent(m.roi)],
  ["TIR anual", (m) => formatPercent(m.tirAnual)],
  ["Payback", (m) => (m.paybackMeses === null ? "—" : `${m.paybackMeses} meses`)],
]

export type LinhaCenarios = {
  indicador: string
  conservador: string
  base: string
  otimista: string
}

export function linhasCenarios(cenarios: ResultadoViabilidade["cenarios"]): LinhaCenarios[] {
  const porNome = Object.fromEntries(cenarios.map((c) => [c.cenario, c]))
  return LINHAS_CENARIOS.map(([indicador, fmt]) => {
    const [conservador, base, otimista] = ORDEM_CENARIOS.map((nome) =>
      porNome[nome] ? fmt(porNome[nome].metricas) : "—",
    )
    return { indicador, conservador, base, otimista }
  })
}

/** Como os cenários diferem do base (deltas configurados). */
export function notaCenarios(cenarios: ResultadoViabilidade["cenarios"]): string {
  const c = cenarios.find((x) => x.cenario === "conservador")?.deltas
  const o = cenarios.find((x) => x.cenario === "otimista")?.deltas
  if (!c || !o) return ""
  return (
    `Conservador: preço ${formatPercent(c.preco)}, custo +${formatPercent(c.custo)}, vendas ` +
    `${formatPercent(c.prazoVendas)} mais lentas. Otimista: preço +${formatPercent(o.preco)}, custo ` +
    `${formatPercent(o.custo)}, vendas ${formatPercent(Math.abs(o.prazoVendas))} mais rápidas.`
  )
}

export const ROTULO_RESTRICAO: Record<TipoRestricao, string> = {
  app: "APP",
  area_alagavel: "Área alagável",
  zona_protecao_ambiental: "Zona de proteção ambiental",
  faixa_nao_edificavel: "Faixa não edificável",
  faixa_dominio: "Faixa de domínio",
  tombamento: "Tombamento",
  servidao: "Servidão",
  outro: "Outra restrição",
}

export type ParametroRelatorio = {
  campo: CampoRegra
  rotulo: string
  valor: string
  fonte: string | null
}

/** Parâmetros validados usados no estudo, cada um com a lei e o artigo. */
export function parametrosUrbanisticos(entrada: EntradaViabilidade): ParametroRelatorio[] {
  const r = entrada.regra
  const n = (v: number | null, sufixo = "") => (v === null ? null : `${formatNumber(v)}${sufixo}`)
  const recuo = (v: string | null) =>
    v === null
      ? null
      : /^\d+([.,]\d+)?$/.test(v.trim())
        ? `${v.trim().replace(".", ",")} m`
        : `${v} (H = altura, m)`
  const linhas: [CampoRegra, string, string | null][] = [
    ["ca_basico", "CA básico", n(r.caBasico)],
    ["ca_max", "CA máximo", n(r.caMaximo)],
    ["to_max", "Taxa de ocupação máxima", r.toMax === null ? null : formatPercent(r.toMax)],
    ["gabarito_m", "Gabarito (altura)", n(r.gabaritoM, " m")],
    ["gabarito_pavimentos", "Gabarito (pavimentos)", n(r.gabaritoPavimentos)],
    ["recuo_frontal", "Recuo frontal", recuo(r.recuoFrontal)],
    ["recuo_lateral", "Recuo lateral", recuo(r.recuoLateral)],
    ["recuo_fundos", "Recuo de fundos", recuo(r.recuoFundos)],
    ["lote_minimo_m2", "Lote mínimo", r.loteMinimoM2 === null ? null : formatArea(r.loteMinimoM2)],
    ["testada_minima_m", "Testada mínima", n(r.testadaMinimaM, " m")],
    ["outorga_fator", "Fator de outorga onerosa", n(r.outorgaFator)],
  ]
  return linhas
    .filter(([, , valor]) => valor !== null)
    .map(([campo, rotulo, valor]) => ({
      campo,
      rotulo,
      valor: valor!,
      fonte: r.fontes[campo] ? formatarFonte(r.fontes[campo]) : null,
    }))
}

/** Restrições físico-ambientais do terreno em texto. */
export function restricoesEmTexto(entrada: EntradaViabilidade): string[] {
  return entrada.terreno.restricoes.map(
    (r) =>
      `${ROTULO_RESTRICAO[r.tipo]}: ${r.origem}${r.sobreposicaoM2 ? ` (${formatArea(r.sobreposicaoM2)})` : ""}`,
  )
}

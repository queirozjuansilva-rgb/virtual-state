import { LAND_USE } from "@/lib/domain/labels"
import type { MesFluxo } from "@/lib/feasibility"
import {
  formatArea,
  formatBRL,
  formatDateTime,
  formatMeters,
  formatNumber,
  formatPercent,
} from "@/lib/format"
import { formatarFonte, formatarValorPremissa } from "@/lib/format/fonte"

import {
  linhasCenarios,
  notaCenarios,
  parametrosUrbanisticos,
  restricoesEmTexto,
  type LinhaCenarios,
  type ParametroRelatorio,
} from "./secoes"
import type { ContextoEstudo, VersaoRelatorio } from "./tipos"

/**
 * Conteúdo do PDF (PRD, Módulo 6): identidade, data, versão do relatório e do
 * motor, resumo, cenários, gráfico, urbanístico com fontes, premissas com
 * origem, risco e disclaimer. Pura e testável; o desenho fica no servidor.
 */

export type Par = { rotulo: string; valor: string }

export type ModeloPdf = {
  titulo: string
  organizacao: string
  versao: number
  versaoMotor: string
  salvaEm: string
  geradoEm: string
  local: string
  ficticio: boolean
  pendencias: string[]
  resumo: Par[]
  situacao: Par[]
  cenarios: LinhaCenarios[]
  notaCenarios: string
  fluxo: MesFluxo[]
  potencial: Par[]
  urbanistico: { validado: boolean; parametros: ParametroRelatorio[]; restricoes: string[] }
  risco: {
    nivel: string
    score: number
    flags: { rotulo: string; detalhe: string; peso: number }[]
  }
  premissas: { rotulo: string; valor: string; fonte: string }[]
  avisos: string[]
  disclaimer: string
}

const NIVEL = { baixo: "Baixo", medio: "Médio", alto: "Alto" } as const

export function montarModeloPdf(dados: {
  titulo: string
  organizacao: string
  versao: VersaoRelatorio
  contexto: Partial<ContextoEstudo>
  terreno: {
    codigo: string
    endereco: string
    bairro: string | null
    municipio: string
    uf: string
    ficticio: boolean
  } | null
  geradoEm: Date
}): ModeloPdf {
  const { entrada, resultado: r } = dados.versao
  const m = r.base?.metricas
  const p = r.potencial
  const t = dados.terreno

  return {
    titulo: dados.titulo,
    organizacao: dados.organizacao,
    versao: dados.versao.versao,
    versaoMotor: dados.versao.versaoMotor,
    salvaEm: formatDateTime(dados.versao.salvaEm),
    geradoEm: formatDateTime(dados.geradoEm),
    local: t
      ? `${t.codigo} · ${t.endereco}${t.bairro ? `, ${t.bairro}` : ""} · ${t.municipio}/${t.uf}`
      : (dados.contexto.referencia ?? "Local não informado"),
    ficticio: Boolean(t?.ficticio),
    pendencias: r.pendencias,
    resumo: m
      ? [
          { rotulo: "Margem líquida", valor: formatPercent(m.margemVgv) },
          { rotulo: "ROI", valor: formatPercent(m.roi) },
          { rotulo: "TIR anual", valor: formatPercent(m.tirAnual) },
          {
            rotulo: "Payback",
            valor: m.paybackMeses === null ? "Não retorna" : `${m.paybackMeses} meses`,
          },
          { rotulo: "VGV", valor: formatBRL(m.vgv) },
          { rotulo: "Lucro", valor: formatBRL(m.lucro) },
          { rotulo: "Custo total", valor: formatBRL(m.custoTotal) },
          { rotulo: "Exposição máxima", valor: formatBRL(m.exposicaoMaxima) },
        ]
      : [],
    situacao: [
      { rotulo: "Uso", valor: dados.contexto.uso ? LAND_USE[dados.contexto.uso] : LAND_USE[r.uso] },
      { rotulo: "Zona", valor: entrada.terreno.zona.codigo ?? "não identificada" },
      { rotulo: "Área do terreno", valor: formatArea(entrada.terreno.areaM2) },
      {
        rotulo: "Testada",
        valor:
          entrada.terreno.testadaM === null
            ? "não informada"
            : formatMeters(entrada.terreno.testadaM),
      },
    ],
    cenarios: linhasCenarios(r.cenarios),
    notaCenarios: notaCenarios(r.cenarios),
    fluxo: r.base?.fluxo ?? [],
    potencial: p
      ? [
          { rotulo: "Área computável", valor: formatArea(p.areaComputavelM2) },
          { rotulo: "Área privativa", valor: formatArea(p.areaPrivativaM2) },
          { rotulo: "Pavimentos", valor: `${p.pavimentos} (${formatMeters(p.alturaM)})` },
          {
            rotulo: "CA aplicado",
            valor: `${formatNumber(p.caAplicado)}${p.usaOutorga ? " (com outorga)" : ""}`,
          },
        ]
      : [],
    urbanistico: {
      validado: entrada.regra.status === "validado",
      parametros: parametrosUrbanisticos(entrada),
      restricoes: restricoesEmTexto(entrada),
    },
    risco: {
      nivel: NIVEL[r.risco.nivel],
      score: r.risco.score,
      flags: r.risco.flags.map((f) => ({ rotulo: f.rotulo, detalhe: f.detalhe, peso: f.peso })),
    },
    premissas: r.premissas.map((x) => ({
      rotulo: x.rotulo,
      valor: formatarValorPremissa(x),
      fonte: formatarFonte(x.fonte),
    })),
    avisos: r.avisos,
    disclaimer: r.disclaimer,
  }
}

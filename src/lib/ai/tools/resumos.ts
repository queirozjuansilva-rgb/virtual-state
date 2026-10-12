import {
  ENVIRONMENTAL_LAYER_KIND,
  LAND_STATUS,
  LAND_USE,
  NEGOTIATION_TYPE,
  TOPOGRAPHY,
} from "@/lib/domain/labels"
import type {
  CandidatoRanqueado,
  Limitante,
  Metricas,
  NivelRisco,
  ResultadoViabilidade,
  TipoRestricao,
  Uso,
} from "@/lib/feasibility"
import { formatarFonte, formatarValorPremissa } from "@/lib/format/fonte"
import { formatArea, formatBRL, formatMeters, formatNumber, formatPercent } from "@/lib/format"

import type { RestricaoBruta, TerrenoBruto } from "../dados"
import type {
  EstudoResumo,
  MetricasResumo,
  ResultadoViabilidadeCopiloto,
  TerrenoDetalhe,
  TerrenoResumo,
} from "../tipos"

/** Formatação pt-BR dos resultados das ferramentas (o modelo cita estes textos). */

export function rotuloUso(uso: Uso): string {
  return LAND_USE[uso]
}

export function resumoTerreno(t: TerrenoBruto): TerrenoResumo {
  const precoM2 = t.preco_pedido !== null && t.area_m2 ? t.preco_pedido / t.area_m2 : null
  return {
    id: t.id,
    codigo: t.code,
    endereco: t.address,
    bairro: t.neighborhood,
    municipio: t.municipality.name,
    uf: t.municipality.uf,
    area_m2: t.area_m2,
    area_fmt: formatArea(t.area_m2),
    preco_pedido: t.preco_pedido,
    preco_fmt: t.preco_pedido === null ? "não informado" : formatBRL(t.preco_pedido),
    preco_m2_terreno_fmt: precoM2 === null ? "—" : `${formatBRL(precoM2)}/m²`,
    negociacao: t.negociacao ? NEGOTIATION_TYPE[t.negociacao] : null,
    situacao: LAND_STATUS[t.status],
    zona: t.zone?.code ?? null,
    zonas_cruzadas: t.zones_overlap_count,
    usos_permitidos: t.usos_permitidos,
    ficticio: t.is_fictitious,
  }
}

const ROTULO_RESTRICAO: Record<TipoRestricao, string> = {
  ...ENVIRONMENTAL_LAYER_KIND,
  servidao: "Servidão",
}

export function restricoesDoTerreno(
  t: TerrenoBruto,
  camadas: RestricaoBruta[],
): TerrenoDetalhe["restricoes"] {
  const lista: TerrenoDetalhe["restricoes"] = camadas.map((c) => ({
    tipo: ROTULO_RESTRICAO[c.kind],
    descricao: `${c.name}${c.overlap_m2 ? ` (sobreposição de ${formatArea(c.overlap_m2)})` : ""}${c.is_fictitious ? " — camada fictícia" : ""}`,
  }))
  const checklist: [boolean, TipoRestricao][] = [
    [t.tem_app, "app"],
    [t.tem_area_alagavel, "area_alagavel"],
    [t.tem_faixa_dominio, "faixa_dominio"],
    [t.tem_tombamento, "tombamento"],
    [t.tem_servidao, "servidao"],
  ]
  for (const [marcado, tipo] of checklist) {
    if (marcado)
      lista.push({ tipo: ROTULO_RESTRICAO[tipo], descricao: "Marcado no checklist do cadastro" })
  }
  return lista
}

export function detalheTerreno(t: TerrenoBruto, camadas: RestricaoBruta[]): TerrenoDetalhe {
  return {
    ...resumoTerreno(t),
    testada_m: t.testada_principal_m,
    esquina: t.esquina,
    topografia: t.topografia ? TOPOGRAPHY[t.topografia] : null,
    declividade_pct: t.declividade_pct,
    matricula_informada: Boolean(t.matricula_numero?.trim()),
    onus: t.onus?.trim() || null,
    permuta_pct_fmt: t.permuta_pct === null ? null : formatPercent(t.permuta_pct),
    zona_atribuicao: t.zone ? t.zone_assignment : "nenhuma",
    restricoes: restricoesDoTerreno(t, camadas),
    observacoes: t.observacoes?.trim() || null,
  }
}

// Viabilidade ------------------------------------------------------------------------

const ROTULO_LIMITANTE: Record<Limitante, string> = {
  coeficiente_aproveitamento: "Coeficiente de aproveitamento",
  taxa_ocupacao: "Taxa de ocupação",
  recuos: "Recuos",
  gabarito: "Gabarito",
}

export const ROTULO_NIVEL: Record<NivelRisco, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
}

const ROTULO_CENARIO = { conservador: "Conservador", base: "Base", otimista: "Otimista" }

function payback(meses: number | null): string {
  if (meses === null) return "não se paga no horizonte do estudo"
  return `${meses} ${meses === 1 ? "mês" : "meses"}`
}

export function resumoMetricas(m: Metricas): MetricasResumo {
  return {
    vgv_fmt: formatBRL(m.vgv),
    custo_total_fmt: formatBRL(m.custoTotal),
    lucro_fmt: formatBRL(m.lucro),
    margem_fmt: formatPercent(m.margemVgv),
    roi_fmt: m.roi === null ? "—" : formatPercent(m.roi),
    tir_anual_fmt: m.tirAnual === null ? "indeterminada" : `${formatPercent(m.tirAnual)} a.a.`,
    payback_fmt: payback(m.paybackMeses),
    exposicao_fmt: formatBRL(m.exposicaoMaxima),
  }
}

/** Premissas que o usuário mais questiona, na ordem em que aparecem no cartão. */
const PREMISSAS_PRINCIPAIS = [
  "precoVendaM2",
  "cubM2",
  "precoTerreno",
  "formaAquisicao",
  "eficiencia",
  "prazoObraMeses",
  "prazoVendasMeses",
  "impostosPct",
] as const

export function resumoEstudo(
  uso: Uso,
  estudo:
    | { ok: true; resultado: ResultadoViabilidade; avisos: string[]; runId: string | null }
    | { ok: false; pendencias: string[]; avisos: string[] },
): EstudoResumo {
  if (!estudo.ok) {
    return {
      uso,
      uso_rotulo: rotuloUso(uso),
      status: "nao_rodou",
      pendencias: estudo.pendencias,
      potencial: null,
      base: null,
      cenarios: [],
      risco: null,
      premissas_principais: [],
      avisos: estudo.avisos,
      analysis_run_id: null,
    }
  }
  const r = estudo.resultado
  const p = r.potencial
  const premissas = new Map(r.premissas.map((x) => [x.chave, x]))
  return {
    uso,
    uso_rotulo: rotuloUso(uso),
    status: r.status,
    pendencias: r.pendencias,
    potencial: p
      ? {
          area_computavel_fmt: formatArea(p.areaComputavelM2),
          pavimentos: p.pavimentos,
          altura_fmt: formatMeters(p.alturaM),
          limitante: ROTULO_LIMITANTE[p.limitante],
          area_privativa_fmt: formatArea(p.areaPrivativaM2),
          ca_aplicado_fmt: formatNumber(p.caAplicado),
          usa_outorga: p.usaOutorga,
        }
      : null,
    base: r.base ? resumoMetricas(r.base.metricas) : null,
    cenarios: r.cenarios.map((c) => ({
      cenario: ROTULO_CENARIO[c.cenario],
      margem_fmt: formatPercent(c.metricas.margemVgv),
      lucro_fmt: formatBRL(c.metricas.lucro),
      tir_anual_fmt:
        c.metricas.tirAnual === null
          ? "indeterminada"
          : `${formatPercent(c.metricas.tirAnual)} a.a.`,
    })),
    risco: {
      score: r.risco.score,
      nivel: ROTULO_NIVEL[r.risco.nivel],
      flags: r.risco.flags.map((f) => ({ rotulo: f.rotulo, detalhe: f.detalhe })),
    },
    premissas_principais: PREMISSAS_PRINCIPAIS.flatMap((chave) => {
      const x = premissas.get(chave)
      if (!x) return []
      return [
        {
          rotulo: x.rotulo,
          valor_fmt: formatarValorPremissa(x),
          fonte: formatarFonte(x.fonte),
        },
      ]
    }),
    avisos: estudo.avisos,
    analysis_run_id: estudo.runId,
  }
}

export function resumoRanking(
  ranking: CandidatoRanqueado[],
): ResultadoViabilidadeCopiloto["ranking"] {
  return ranking.map((c) => ({
    uso: c.uso,
    uso_rotulo: rotuloUso(c.uso),
    elegivel: c.elegivel,
    motivo: c.motivo,
    tir_anual_fmt: c.tirAnual === null ? "—" : `${formatPercent(c.tirAnual)} a.a.`,
    margem_fmt: c.margemVgv === null ? "—" : formatPercent(c.margemVgv),
    score_risco: c.scoreRisco,
    indice_fmt: c.indice === null ? "—" : formatPercent(c.indice),
  }))
}

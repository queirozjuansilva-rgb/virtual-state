import "server-only"

import type { Uso } from "@/lib/feasibility"
import type { Enums, Json } from "@/lib/supabase/database.types"
import type { createClient } from "@/lib/supabase/server"

import {
  inicioJanela,
  montarConfig,
  TIPOLOGIA_POR_USO,
  type ConfigMotor,
  type LinhaDefault,
  type LinhaPeso,
} from "./config"
import type { ContextoTerreno, RegraDb } from "./montar-entrada"

export type Supabase = Awaited<ReturnType<typeof createClient>>

function falhou(etapa: string, error: { message: string } | null) {
  if (error) throw new Error(`Falha ao carregar ${etapa}: ${error.message}`)
}

const COLUNAS_REGRA =
  "use_type, permitted, ca_basico, ca_max, to_max, gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos, lote_minimo_m2, testada_minima_m, outorga_fator, observacoes, rule_sources(field, article, excerpt, legal_document:legal_documents(kind, number, is_fictitious))"

export async function carregarConfig(supabase: Supabase): Promise<ConfigMotor> {
  const [defaults, pesos] = await Promise.all([
    supabase.from("feasibility_defaults").select("key, value, source"),
    supabase.from("risk_weights").select("flag_code, axis, weight, label, active"),
  ])
  falhou("os defaults", defaults.error)
  falhou("os pesos de risco", pesos.error)
  return montarConfig((defaults.data ?? []) as LinhaDefault[], (pesos.data ?? []) as LinhaPeso[])
}

/** Regras validadas de uma zona (todos os usos), com a fonte de cada campo. */
export async function carregarRegrasValidadas(
  supabase: Supabase,
  zoneId: string,
): Promise<(RegraDb & { observacoes: string | null })[]> {
  const { data, error } = await supabase
    .from("zoning_rules")
    .select(COLUNAS_REGRA)
    .eq("zone_id", zoneId)
    .eq("status", "validado")
  falhou("as regras", error)
  return (data ?? []) as unknown as (RegraDb & { observacoes: string | null })[]
}

/** CUB mais recente da UF, por padrão. */
export async function carregarCubs(
  supabase: Supabase,
  uf: string,
): Promise<ContextoTerreno["cubs"]> {
  const { data, error } = await supabase
    .from("cub_values")
    .select("standard, value_m2, reference_month, source")
    .eq("uf", uf)
    .order("reference_month", { ascending: false })
  falhou("o CUB", error)
  const porPadrao: ContextoTerreno["cubs"] = {}
  for (const c of data ?? []) {
    porPadrao[c.standard] ??= {
      value_m2: Number(c.value_m2),
      reference_month: c.reference_month,
      source: c.source,
    }
  }
  return porPadrao
}

type Tipologia = Enums<"comparable_typology">

function tipologias(usos: Uso[]): Tipologia[] {
  return [...new Set(usos.map((u) => TIPOLOGIA_POR_USO[u]))]
}

/**
 * Carrega tudo o que o motor precisa sobre um terreno (respeitando a RLS do
 * usuário). `usos` define para quais tipologias buscar comparáveis; sem ele,
 * usa os usos das regras validadas da zona. Retorna null se o terreno não for
 * visível para o usuário.
 */
export async function carregarContexto(
  supabase: Supabase,
  landId: string,
  usos?: Uso[],
): Promise<ContextoTerreno | null> {
  const { data: land, error: landError } = await supabase
    .from("lands")
    .select(
      "id, code, area_m2, area_informada_m2, testada_principal_m, esquina, declividade_pct, matricula_numero, onus, preco_pedido, negociacao, permuta_pct, zone_assignment, zones_overlap_count, zone_id, geojson, municipality_id, tem_app, tem_area_alagavel, tem_faixa_dominio, tem_tombamento, tem_servidao, is_fictitious, zone:zones(id, code), municipality:municipalities(uf)",
    )
    .eq("id", landId)
    .maybeSingle()
  falhou("o terreno", landError)
  if (!land) return null

  const uf = land.municipality?.uf ?? ""
  const [regras, config, cubs, hits] = await Promise.all([
    land.zone_id ? carregarRegrasValidadas(supabase, land.zone_id) : Promise.resolve([]),
    carregarConfig(supabase),
    carregarCubs(supabase, uf),
    land.geojson
      ? supabase.rpc("environmental_hits", {
          p_geojson: land.geojson as Json,
          p_municipality_id: land.municipality_id,
        })
      : Promise.resolve({ data: [], error: null }),
  ])
  falhou("as restrições ambientais", hits.error)

  const desde = inicioJanela(config)
  const comparaveis: ContextoTerreno["comparaveis"] = {}
  await Promise.all(
    tipologias(usos ?? regras.map((r) => r.use_type)).map(async (tipologia) => {
      const { data, error } = await supabase.rpc("comparables_near_land", {
        p_land_id: landId,
        p_typology: tipologia,
        p_radius_m: Math.round(config.mercado.raioM),
        p_since: desde,
      })
      falhou("os comparáveis", error)
      comparaveis[tipologia] = (data ?? []).map((c) => ({
        price_m2: Number(c.price_m2),
        is_fictitious: c.is_fictitious,
      }))
    }),
  )

  return {
    terreno: {
      id: land.id,
      code: land.code,
      area_m2: land.area_m2,
      area_informada_m2: land.area_informada_m2,
      testada_principal_m: land.testada_principal_m,
      esquina: land.esquina,
      declividade_pct: land.declividade_pct,
      matricula_numero: land.matricula_numero,
      onus: land.onus,
      preco_pedido: land.preco_pedido,
      negociacao: land.negociacao,
      permuta_pct: land.permuta_pct,
      zone_assignment: land.zone_assignment,
      zones_overlap_count: land.zones_overlap_count,
      zone: land.zone ? { id: land.zone.id, code: land.zone.code } : null,
      uf,
      tem_app: land.tem_app,
      tem_area_alagavel: land.tem_area_alagavel,
      tem_faixa_dominio: land.tem_faixa_dominio,
      tem_tombamento: land.tem_tombamento,
      tem_servidao: land.tem_servidao,
      is_fictitious: land.is_fictitious,
    },
    regras,
    hitsAmbientais: (hits.data ?? []).map((h) => ({
      kind: h.kind,
      name: h.name,
      overlap_m2: Number(h.overlap_m2),
      is_fictitious: h.is_fictitious,
    })),
    cubs,
    comparaveis,
    config,
    desde,
  }
}

type PontoDb = {
  zona: { id: string; code: string; name: string; municipality_id: string } | null
  municipio: { id: string; name: string; uf: string; coverage_status: string } | null
  camadas: { kind: Enums<"environmental_layer_kind">; name: string; is_fictitious: boolean }[]
}

export async function analisarPonto(
  supabase: Supabase,
  longitude: number,
  latitude: number,
): Promise<PontoDb> {
  const { data, error } = await supabase.rpc("analisar_ponto", {
    p_lon: longitude,
    p_lat: latitude,
  })
  falhou("o ponto", error)
  const ponto = (data ?? {}) as Partial<PontoDb>
  return {
    zona: ponto.zona ?? null,
    municipio: ponto.municipio ?? null,
    camadas: ponto.camadas ?? [],
  }
}

/**
 * Contexto para estudar um ponto fora do land bank (área informada pelo
 * usuário). Retorna null se nenhuma zona cadastrada contém o ponto.
 */
export async function carregarContextoPonto(
  supabase: Supabase,
  params: {
    longitude: number
    latitude: number
    areaM2: number
    testadaM: number | null
    precoTerreno: number | null
    usos: Uso[]
  },
): Promise<ContextoTerreno | null> {
  const ponto = await analisarPonto(supabase, params.longitude, params.latitude)
  if (!ponto.zona || !ponto.municipio) return null

  const [regras, config, cubs] = await Promise.all([
    carregarRegrasValidadas(supabase, ponto.zona.id),
    carregarConfig(supabase),
    carregarCubs(supabase, ponto.municipio.uf),
  ])
  const desde = inicioJanela(config)
  const comparaveis: ContextoTerreno["comparaveis"] = {}
  await Promise.all(
    tipologias(params.usos).map(async (tipologia) => {
      const { data, error } = await supabase.rpc("comparables_near_point", {
        p_lon: params.longitude,
        p_lat: params.latitude,
        p_typology: tipologia,
        p_radius_m: Math.round(config.mercado.raioM),
        p_since: desde,
      })
      falhou("os comparáveis", error)
      comparaveis[tipologia] = (data ?? []).map((c) => ({
        price_m2: Number(c.price_m2),
        is_fictitious: c.is_fictitious,
      }))
    }),
  )

  return contextoDePonto({ ...params, ponto, regras, config, cubs, comparaveis, desde })
}

/** Monta o contexto sintético de um ponto (sem I/O; usado também nos evals). */
export function contextoDePonto(p: {
  longitude: number
  latitude: number
  areaM2: number
  testadaM: number | null
  precoTerreno: number | null
  ponto: PontoDb
  regras: RegraDb[]
  config: ConfigMotor
  cubs: ContextoTerreno["cubs"]
  comparaveis: ContextoTerreno["comparaveis"]
  desde: string
}): ContextoTerreno {
  const coordenadas = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
  return {
    terreno: {
      id: "ponto",
      code: `Ponto ${coordenadas}`,
      area_m2: p.areaM2,
      area_informada_m2: p.areaM2,
      testada_principal_m: p.testadaM,
      esquina: false,
      declividade_pct: null,
      matricula_numero: null,
      onus: null,
      preco_pedido: p.precoTerreno,
      negociacao: p.precoTerreno ? "dinheiro" : null,
      permuta_pct: null,
      zone_assignment: "automatica",
      zones_overlap_count: 1,
      zone: p.ponto.zona ? { id: p.ponto.zona.id, code: p.ponto.zona.code } : null,
      uf: p.ponto.municipio?.uf ?? "",
      tem_app: false,
      tem_area_alagavel: false,
      tem_faixa_dominio: false,
      tem_tombamento: false,
      tem_servidao: false,
      is_fictitious: false,
    },
    regras: p.regras,
    hitsAmbientais: p.ponto.camadas.map((c) => ({
      kind: c.kind,
      name: c.name,
      overlap_m2: null,
      is_fictitious: c.is_fictitious,
    })),
    cubs: p.cubs,
    comparaveis: p.comparaveis,
    config: p.config,
    desde: p.desde,
  }
}

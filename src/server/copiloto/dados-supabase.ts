import "server-only"

import type { Uso } from "@/lib/feasibility"
import type {
  DadosCopiloto,
  RefTerreno,
  RegraComZona,
  RegraCompleta,
  TerrenoBruto,
} from "@/lib/ai/dados"
import type { Json } from "@/lib/supabase/database.types"

import {
  analisarPonto,
  carregarConfig,
  carregarContexto,
  carregarContextoPonto,
  type Supabase,
} from "@/server/feasibility/carregar-contexto"
import { registrarExecucao } from "@/server/feasibility/registro"

function falhou(etapa: string, error: { message: string } | null) {
  if (error) throw new Error(`Falha ao consultar ${etapa}: ${error.message}`)
}

/** Colunas do terreno visíveis ao copiloto. Contato do proprietário fica de fora. */
const COLUNAS_TERRENO =
  "id, code, address, neighborhood, area_m2, testada_principal_m, esquina, topografia, declividade_pct, matricula_numero, onus, status, preco_pedido, negociacao, permuta_pct, zone_assignment, zones_overlap_count, tem_app, tem_area_alagavel, tem_faixa_dominio, tem_tombamento, tem_servidao, observacoes, is_fictitious, municipality:municipalities(id, name, uf), zone:zones(id, code, name, zoning_rules(use_type, permitted, status))"

const COLUNAS_REGRA =
  "use_type, use_label_local, permitted, ca_min, ca_basico, ca_max, to_max, permeabilidade_min, gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos, lote_minimo_m2, testada_minima_m, outorga_fator, outorga_formula, observacoes, rule_sources(field, article, excerpt, legal_document:legal_documents(kind, number, is_fictitious)), zone:zones(id, code, name)"

type LinhaTerreno = Omit<TerrenoBruto, "usos_permitidos" | "zone" | "municipality"> & {
  municipality: { id: string; name: string; uf: string } | null
  zone: {
    id: string
    code: string
    name: string
    zoning_rules: { use_type: Uso; permitted: boolean; status: string }[]
  } | null
}

function paraTerreno(l: LinhaTerreno): TerrenoBruto {
  const num = (v: number | null) => (v === null ? null : Number(v))
  return {
    ...l,
    area_m2: num(l.area_m2),
    testada_principal_m: num(l.testada_principal_m),
    declividade_pct: num(l.declividade_pct),
    preco_pedido: num(l.preco_pedido),
    permuta_pct: num(l.permuta_pct),
    municipality: l.municipality ?? { id: "", name: "—", uf: "" },
    zone: l.zone ? { id: l.zone.id, code: l.zone.code, name: l.zone.name } : null,
    usos_permitidos: (l.zone?.zoning_rules ?? [])
      .filter((r) => r.status === "validado" && r.permitted)
      .map((r) => r.use_type)
      .sort(),
  }
}

type LinhaRegra = RegraCompleta & { zone: { id: string; code: string; name: string } }

function comZona({ zone, ...regra }: LinhaRegra): RegraComZona {
  return { zona: zone, regra }
}

function hojeFortaleza(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date())
}

/**
 * Dados do copiloto lidos com o cliente do usuário: a RLS decide o que ele vê.
 * `conversationId` liga as execuções do motor à conversa (analysis_runs).
 */
export function dadosSupabase(supabase: Supabase, conversationId: string | null): DadosCopiloto {
  async function geometria(landId: string) {
    const { data, error } = await supabase
      .from("lands")
      .select("geojson, municipality_id")
      .eq("id", landId)
      .maybeSingle()
    falhou("o terreno", error)
    return data
  }

  return {
    async listarTerrenos() {
      const { data, error } = await supabase.from("lands").select(COLUNAS_TERRENO).order("code")
      falhou("os terrenos", error)
      return ((data ?? []) as unknown as LinhaTerreno[]).map(paraTerreno)
    },

    async obterTerreno(ref: RefTerreno) {
      let query = supabase.from("lands").select(COLUNAS_TERRENO)
      if (ref.id) query = query.eq("id", ref.id)
      else if (ref.codigo) query = query.ilike("code", ref.codigo.trim())
      else return null
      const { data, error } = await query.maybeSingle()
      falhou("o terreno", error)
      return data ? paraTerreno(data as unknown as LinhaTerreno) : null
    },

    async zonasCruzadas(landId) {
      const land = await geometria(landId)
      if (!land?.geojson) return []
      const { data, error } = await supabase.rpc("identify_zones", {
        p_geojson: land.geojson as Json,
        p_municipality_id: land.municipality_id,
      })
      falhou("as zonas", error)
      return (data ?? []).map((z) => ({ code: z.code, overlap_ratio: Number(z.overlap_ratio) }))
    },

    async restricoesDoTerreno(landId) {
      const land = await geometria(landId)
      if (!land?.geojson) return []
      const { data, error } = await supabase.rpc("environmental_hits", {
        p_geojson: land.geojson as Json,
        p_municipality_id: land.municipality_id,
      })
      falhou("as restrições", error)
      return (data ?? []).map((h) => ({
        kind: h.kind,
        name: h.name,
        is_fictitious: h.is_fictitious,
        overlap_m2: Number(h.overlap_m2),
      }))
    },

    analisarPonto: (longitude, latitude) => analisarPonto(supabase, longitude, latitude),

    async zona(zoneId) {
      const { data, error } = await supabase
        .from("zones")
        .select("id, code, name, municipality_id")
        .eq("id", zoneId)
        .maybeSingle()
      falhou("a zona", error)
      return data
    },

    async regraValidada(zoneId, uso) {
      const { data, error } = await supabase
        .from("zoning_rules")
        .select(COLUNAS_REGRA)
        .eq("zone_id", zoneId)
        .eq("use_type", uso)
        .eq("status", "validado")
        .maybeSingle()
      falhou("a regra", error)
      return data ? comZona(data as unknown as LinhaRegra) : null
    },

    async regrasValidadas(zoneId) {
      const { data, error } = await supabase
        .from("zoning_rules")
        .select(COLUNAS_REGRA)
        .eq("zone_id", zoneId)
        .eq("status", "validado")
        .order("use_type")
      falhou("as regras", error)
      return ((data ?? []) as unknown as LinhaRegra[]).map(comZona)
    },

    async municipios() {
      const { data, error } = await supabase
        .from("municipalities")
        .select("id, name, uf, coverage_status")
        .order("name")
      falhou("os municípios", error)
      return data ?? []
    },

    async contarTrechosLegais(municipioId) {
      const { count, error } = await supabase
        .from("legal_chunks")
        .select("id, legal_documents!inner(municipality_id)", { count: "exact", head: true })
        .eq("legal_documents.municipality_id", municipioId)
      falhou("a legislação", error)
      return count ?? 0
    },

    async buscarTextoLegal(municipioId, pergunta) {
      const { data, error } = await supabase.rpc("buscar_texto_legal", {
        p_municipality_id: municipioId,
        p_query: pergunta,
        p_limit: 5,
      })
      falhou("a legislação", error)
      return (data ?? []).map((t) => ({
        documento: t.documento,
        article: t.article,
        content: t.content,
        is_fictitious: t.is_fictitious,
      }))
    },

    async comparaveisTerreno(landId, tipologia, raioM, desde) {
      const { data, error } = await supabase.rpc("comparables_near_land", {
        p_land_id: landId,
        p_typology: tipologia,
        p_radius_m: Math.round(raioM),
        p_since: desde,
      })
      falhou("os comparáveis", error)
      return (data ?? []).map((c) => ({
        price_m2: Number(c.price_m2),
        is_fictitious: c.is_fictitious,
      }))
    },

    async comparaveisPonto(longitude, latitude, tipologia, raioM, desde) {
      const { data, error } = await supabase.rpc("comparables_near_point", {
        p_lon: longitude,
        p_lat: latitude,
        p_typology: tipologia,
        p_radius_m: Math.round(raioM),
        p_since: desde,
      })
      falhou("os comparáveis", error)
      return (data ?? []).map((c) => ({
        price_m2: Number(c.price_m2),
        is_fictitious: c.is_fictitious,
      }))
    },

    async cubMaisRecente(uf, padrao) {
      const { data, error } = await supabase.rpc("latest_cub", { p_uf: uf, p_standard: padrao })
      falhou("o CUB", error)
      const cub = data?.[0]
      return cub
        ? {
            value_m2: Number(cub.value_m2),
            reference_month: cub.reference_month,
            source: cub.source,
          }
        : null
    },

    configMotor: () => carregarConfig(supabase),

    contextoTerreno: (landId, usos) => carregarContexto(supabase, landId, usos),

    contextoPonto: (params) => carregarContextoPonto(supabase, params),

    registrarAnalise: (params) => registrarExecucao(supabase, { ...params, conversationId }),

    async solicitarCobertura({ municipio, uf, endereco }) {
      const { data, error } = await supabase
        .from("coverage_requests")
        .insert({ municipality_name: municipio, uf, address: endereco })
        .select("id")
        .single()
      falhou("o pedido de cobertura", error)
      return data!.id
    },

    hoje: hojeFortaleza,
  }
}

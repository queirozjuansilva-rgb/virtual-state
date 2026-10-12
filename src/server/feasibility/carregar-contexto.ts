import "server-only"

import type { Uso } from "@/lib/feasibility"
import type { Json } from "@/lib/supabase/database.types"
import type { createClient } from "@/lib/supabase/server"

import { montarConfig, TIPOLOGIA_POR_USO, type LinhaDefault, type LinhaPeso } from "./config"
import type { ContextoTerreno, RegraDb } from "./montar-entrada"

type Supabase = Awaited<ReturnType<typeof createClient>>

function falhou(etapa: string, error: { message: string } | null) {
  if (error) throw new Error(`Falha ao carregar ${etapa}: ${error.message}`)
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

  const [regras, defaults, pesos, cubs, hits] = await Promise.all([
    land.zone_id
      ? supabase
          .from("zoning_rules")
          .select(
            "use_type, permitted, ca_basico, ca_max, to_max, gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos, lote_minimo_m2, testada_minima_m, outorga_fator, rule_sources(field, article, excerpt, legal_document:legal_documents(kind, number, is_fictitious))",
          )
          .eq("zone_id", land.zone_id)
          .eq("status", "validado")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("feasibility_defaults").select("key, value, source"),
    supabase.from("risk_weights").select("flag_code, axis, weight, label, active"),
    supabase
      .from("cub_values")
      .select("standard, value_m2, reference_month, source")
      .eq("uf", land.municipality?.uf ?? "")
      .order("reference_month", { ascending: false }),
    land.geojson
      ? supabase.rpc("environmental_hits", {
          p_geojson: land.geojson as Json,
          p_municipality_id: land.municipality_id,
        })
      : Promise.resolve({ data: [], error: null }),
  ])
  falhou("as regras", regras.error)
  falhou("os defaults", defaults.error)
  falhou("os pesos de risco", pesos.error)
  falhou("o CUB", cubs.error)
  falhou("as restrições ambientais", hits.error)

  const config = montarConfig(
    (defaults.data ?? []) as LinhaDefault[],
    (pesos.data ?? []) as LinhaPeso[],
  )

  // CUB mais recente por padrão (a consulta já vem em ordem decrescente).
  const cubPorPadrao: ContextoTerreno["cubs"] = {}
  for (const c of cubs.data ?? []) {
    cubPorPadrao[c.standard] ??= {
      value_m2: Number(c.value_m2),
      reference_month: c.reference_month,
      source: c.source,
    }
  }

  // Comparáveis por tipologia, num raio do lote e dentro da janela de data.
  const regrasDb = (regras.data ?? []) as unknown as RegraDb[]
  const usosAlvo = usos ?? regrasDb.map((r) => r.use_type)
  const tipologias = [...new Set(usosAlvo.map((u) => TIPOLOGIA_POR_USO[u]))]
  const desde = new Date()
  desde.setMonth(desde.getMonth() - config.mercado.janelaMeses)
  const desdeIso = desde.toISOString().slice(0, 10)
  const comparaveis: ContextoTerreno["comparaveis"] = {}
  await Promise.all(
    tipologias.map(async (tipologia) => {
      const { data, error } = await supabase.rpc("comparables_near_land", {
        p_land_id: landId,
        p_typology: tipologia,
        p_radius_m: Math.round(config.mercado.raioM),
        p_since: desdeIso,
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
      uf: land.municipality?.uf ?? "",
      tem_app: land.tem_app,
      tem_area_alagavel: land.tem_area_alagavel,
      tem_faixa_dominio: land.tem_faixa_dominio,
      tem_tombamento: land.tem_tombamento,
      tem_servidao: land.tem_servidao,
      is_fictitious: land.is_fictitious,
    },
    regras: regrasDb,
    hitsAmbientais: (hits.data ?? []).map((h) => ({
      kind: h.kind,
      name: h.name,
      overlap_m2: Number(h.overlap_m2),
      is_fictitious: h.is_fictitious,
    })),
    cubs: cubPorPadrao,
    comparaveis,
    config,
    desde: desdeIso,
  }
}

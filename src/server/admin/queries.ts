import "server-only"

import { notFound } from "next/navigation"

import { requireAdmin } from "@/lib/auth/dal"
import type { Enums } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

/**
 * Consultas do painel admin. Todas exigem admin (defesa em profundidade:
 * a RLS do banco também restringe).
 */
async function adminClient() {
  await requireAdmin()
  return createClient()
}

type Result = { data: unknown; error: { message: string } | null }

/**
 * Lê o resultado sem impor tipo ao builder do supabase-js (um parâmetro genérico
 * como `{ data: T }` faz o TypeScript inferir `never` nos selects aninhados).
 */
function rows<R extends Result>(result: R): NonNullable<R["data"]> {
  if (result.error) throw new Error(result.error.message)
  return result.data as NonNullable<R["data"]>
}

function maybeRow<R extends Result>(result: R): R["data"] {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

// Municípios ----------------------------------------------------------------------

export async function listMunicipalities() {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("municipalities")
      .select("id, ibge_code, name, uf, coverage_status, zones(count), legal_documents(count)")
      .order("uf")
      .order("name"),
  )
}

export async function getMunicipality(id: string) {
  const supabase = await adminClient()
  const data = maybeRow(
    await supabase
      .from("municipalities")
      .select("id, ibge_code, name, uf, coverage_status")
      .eq("id", id)
      .maybeSingle(),
  )
  if (!data) notFound()
  return data
}

export async function listMunicipalityOptions() {
  const supabase = await adminClient()
  return rows(await supabase.from("municipalities").select("id, name, uf").order("name"))
}

// Documentos legais -----------------------------------------------------------------

export async function listLegalDocuments(municipalityId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("legal_documents")
      .select(
        "id, kind, number, title, published_on, effective_from, effective_until, official_url, is_fictitious, archived_at, ingestion_status",
      )
      .eq("municipality_id", municipalityId)
      .order("published_on", { ascending: false, nullsFirst: false }),
  )
}

// Zonas -----------------------------------------------------------------------------

export async function listZones(municipalityId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("zones")
      .select("id, code, name, kind, geojson, archived_at, zoning_rules(status)")
      .eq("municipality_id", municipalityId)
      .order("archived_at", { ascending: false, nullsFirst: true })
      .order("code"),
  )
}

export async function getZone(id: string) {
  const supabase = await adminClient()
  const data = maybeRow(
    await supabase
      .from("zones")
      .select(
        "id, municipality_id, code, name, kind, description, geojson, legal_document_id, municipality:municipalities(id, name, uf)",
      )
      .eq("id", id)
      .maybeSingle(),
  )
  if (!data) notFound()
  return data
}

export async function listEnvironmentalLayers(municipalityId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("environmental_layers")
      .select("id, kind, name, source, geojson, is_fictitious")
      .eq("municipality_id", municipalityId)
      .is("archived_at", null)
      .limit(50),
  )
}

/** Camadas de condicionantes agrupadas por fonte (sem geometria: há milhares de feições). */
export async function summarizeEnvironmentalLayers(municipalityId: string) {
  const supabase = await adminClient()
  const todas: {
    kind: Enums<"environmental_layer_kind">
    source: string
    is_fictitious: boolean
    archived_at: string | null
  }[] = []
  for (let de = 0; ; de += 1000) {
    const lote = rows(
      await supabase
        .from("environmental_layers")
        .select("kind, source, is_fictitious, archived_at")
        .eq("municipality_id", municipalityId)
        .range(de, de + 999),
    )
    todas.push(...lote)
    if (lote.length < 1000) break
  }
  const grupos = new Map<
    string,
    {
      kind: Enums<"environmental_layer_kind">
      source: string
      feicoes: number
      ficticia: boolean
      arquivada: boolean
    }
  >()
  for (const l of todas) {
    const chave = `${l.source}|${l.kind}`
    const g = grupos.get(chave) ?? {
      kind: l.kind,
      source: l.source,
      feicoes: 0,
      ficticia: l.is_fictitious,
      arquivada: Boolean(l.archived_at),
    }
    g.feicoes++
    grupos.set(chave, g)
  }
  return [...grupos.values()].sort((a, b) => a.source.localeCompare(b.source))
}

// Regras ----------------------------------------------------------------------------

const RULE_COLUMNS =
  "id, zone_id, use_type, use_label_local, permitted, ca_min, ca_basico, ca_max, to_max, permeabilidade_min, gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos, lote_minimo_m2, testada_minima_m, outorga_fator, outorga_formula, observacoes, status, validated_at, updated_at"

export async function listRules(zoneId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("zoning_rules")
      .select(`${RULE_COLUMNS}, rule_sources(count)`)
      .eq("zone_id", zoneId)
      .order("use_type")
      .order("status"),
  )
}

export async function getRule(id: string) {
  const supabase = await adminClient()
  const data = maybeRow(
    await supabase
      .from("zoning_rules")
      .select(
        `${RULE_COLUMNS}, validation_note, extracted_values, extraction_run_id, rule_sources(field, legal_document_id, article, excerpt, page, condition, resolution_note, excerpt_verified), zone:zones(id, code, name, municipality_id), extraction:extraction_runs(id, created_at, legal_document_id)`,
      )
      .eq("id", id)
      .maybeSingle(),
  )
  if (!data) notFound()
  return data
}

/**
 * Contexto da revisão lado a lado (Fase 5): regra validada atual da mesma zona
 * × uso (para diferenças e conflitos), alterações posteriores das normas
 * citadas e link para a página de cada PDF.
 */
export async function getRuleReview(rule: {
  id: string
  zone_id: string
  use_type: Enums<"land_use">
  status: Enums<"rule_status">
  rule_sources: { legal_document_id: string }[]
}) {
  const supabase = await adminClient()
  const docIds = [...new Set(rule.rule_sources.map((s) => s.legal_document_id))]
  const [validada, alteracoes, docs] = await Promise.all([
    rule.status === "validado"
      ? Promise.resolve({ data: null })
      : supabase
          .from("zoning_rules")
          .select(`${RULE_COLUMNS}, rule_sources(field, legal_document_id, article)`)
          .eq("zone_id", rule.zone_id)
          .eq("use_type", rule.use_type)
          .eq("status", "validado")
          .maybeSingle(),
    docIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("legal_document_links")
          .select(
            "id, kind, articles, to_document_id, por:legal_documents!legal_document_links_from_document_id_fkey(id, kind, number)",
          )
          .in("to_document_id", docIds)
          .in("kind", ["altera", "revoga"]),
    docIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("legal_documents").select("id, kind, number, storage_path").in("id", docIds),
  ])
  const urls: Record<string, string> = {}
  await Promise.all(
    (docs.data ?? [])
      .filter((d) => d.storage_path)
      .map(async (d) => {
        const { data } = await supabase.storage
          .from("legal-documents")
          .createSignedUrl(d.storage_path!, 3600)
        if (data) urls[d.id] = data.signedUrl
      }),
  )
  return {
    validada: validada.data,
    alteracoes: (alteracoes.data ?? []).map((a) => ({
      ...a,
      por: (Array.isArray(a.por) ? a.por[0] : a.por) as {
        id: string
        kind: Enums<"legal_document_kind">
        number: string
      } | null,
    })),
    documentos: Object.fromEntries((docs.data ?? []).map((d) => [d.id, d])),
    pdfUrls: urls,
  }
}

// Terrenos --------------------------------------------------------------------------

export async function listLands() {
  const supabase = await adminClient()
  return rows(
    await supabase
      .from("lands")
      .select(
        "id, code, address, neighborhood, area_m2, status, preco_pedido, zone_assignment, zones_overlap_count, is_fictitious, zone:zones(code), municipality:municipalities(name, uf)",
      )
      .order("code"),
  )
}

export async function getLand(id: string) {
  const supabase = await adminClient()
  const data = maybeRow(
    await supabase
      .from("lands")
      .select(
        "*, zone:zones(id, code, name), municipality:municipalities(id, name, uf), owner:land_owner_contacts(owner_name, phone, email, notes)",
      )
      .eq("id", id)
      .maybeSingle(),
  )
  if (!data) notFound()
  return data
}

export async function listZoneOptions() {
  const supabase = await adminClient()
  return rows(await supabase.from("zones").select("id, code, name, municipality_id").order("code"))
}

/**
 * Zonas e camadas ambientais para o mapa do terreno. Camadas oficiais podem
 * ter milhares de feições (Fortaleza: alagados, recursos hídricos, ZPA); acima
 * de 300 elas saem do desenho do mapa. A interseção com o lote é sempre
 * calculada no banco (environmental_hits).
 */
export async function listGeoReference() {
  const supabase = await adminClient()
  const MAX_CAMADAS_NO_MAPA = 300
  const [zones, { count }] = await Promise.all([
    supabase
      .from("zones")
      .select("id, code, name, municipality_id, geojson")
      .is("archived_at", null)
      .not("geom", "is", null),
    supabase
      .from("environmental_layers")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
  ])
  const layers =
    (count ?? 0) > MAX_CAMADAS_NO_MAPA
      ? []
      : rows(
          await supabase
            .from("environmental_layers")
            .select("id, kind, name, municipality_id, geojson")
            .is("archived_at", null),
        )
  return { zones: rows(zones), layers }
}

export async function getLandEnvironmentalHits(geojson: unknown, municipalityId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase.rpc("environmental_hits", {
      p_geojson: geojson as never,
      p_municipality_id: municipalityId,
    }),
  )
}

export async function getLandZoneHits(geojson: unknown, municipalityId: string) {
  const supabase = await adminClient()
  return rows(
    await supabase.rpc("identify_zones", {
      p_geojson: geojson as never,
      p_municipality_id: municipalityId,
    }),
  )
}

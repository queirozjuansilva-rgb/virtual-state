import "server-only"

import { notFound } from "next/navigation"

import { requireAdmin } from "@/lib/auth/dal"
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
        "id, kind, number, title, published_on, effective_from, effective_until, official_url, is_fictitious",
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
      .select("id, code, name, kind, geojson, zoning_rules(status)")
      .eq("municipality_id", municipalityId)
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
      .eq("municipality_id", municipalityId),
  )
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
        `${RULE_COLUMNS}, rule_sources(field, legal_document_id, article, excerpt), zone:zones(id, code, name, municipality_id)`,
      )
      .eq("id", id)
      .maybeSingle(),
  )
  if (!data) notFound()
  return data
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

/** Zonas e camadas ambientais de todos os municípios, para o mapa do terreno. */
export async function listGeoReference() {
  const supabase = await adminClient()
  const [zones, layers] = await Promise.all([
    supabase
      .from("zones")
      .select("id, code, name, municipality_id, geojson")
      .not("geom", "is", null),
    supabase.from("environmental_layers").select("id, kind, name, municipality_id, geojson"),
  ])
  return { zones: rows(zones), layers: rows(layers) }
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

"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { requireAdmin } from "@/lib/auth/dal"
import { COVERAGE_STATUS, enumKeys, LEGAL_DOCUMENT_KIND, UFS, ZONE_KIND } from "@/lib/domain/labels"
import {
  checkbox,
  dbErrorState,
  formDataToObject,
  optionalDate,
  optionalText,
  optionalUuid,
  requiredEnum,
  requiredText,
  requiredUuid,
  zodErrorState,
  type FormState,
} from "@/lib/forms"
import { multiPolygonFromString, toMultiPolygon } from "@/lib/geo/geojson"
import type { Json } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

import { landFormSchema, toLandRpcArgs } from "./land-input"
import { parseRuleForm } from "./rule-input"

/** As funções RPC aceitam p_id nulo para "criar"; o tipo gerado não reflete isso. */
const NEW = null as unknown as string

async function adminClient() {
  await requireAdmin()
  return createClient()
}

// Municípios ----------------------------------------------------------------------

const municipalitySchema = z.object({
  name: requiredText("Informe o nome.", 120),
  uf: requiredEnum(UFS, "Selecione a UF."),
  ibge_code: requiredText("Informe o código IBGE.", 7).refine((v) => /^\d{7}$/.test(v), {
    error: "O código IBGE tem 7 dígitos.",
  }),
  coverage_status: requiredEnum(enumKeys(COVERAGE_STATUS)),
})

export async function createMunicipality(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = municipalitySchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)

  const supabase = await adminClient()
  const { data, error } = await supabase
    .from("municipalities")
    .insert(parsed.data)
    .select("id")
    .single()
  if (error) return dbErrorState(error)
  redirect(`/admin/municipios/${data.id}`)
}

export async function updateMunicipality(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = municipalitySchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)

  const supabase = await adminClient()
  const { error } = await supabase.from("municipalities").update(parsed.data).eq("id", id)
  if (error) return dbErrorState(error)
  refresh()
  return { ok: true, message: "Município salvo." }
}

// Documentos legais -----------------------------------------------------------------

const legalDocumentSchema = z
  .object({
    kind: requiredEnum(enumKeys(LEGAL_DOCUMENT_KIND), "Selecione o tipo."),
    number: requiredText("Informe o número.", 60),
    title: requiredText("Informe a ementa ou título.", 300),
    published_on: optionalDate(),
    effective_from: optionalDate(),
    effective_until: optionalDate(),
    official_url: optionalText(500).refine((v) => v === null || /^https?:\/\//.test(v), {
      error: "Use um link http(s).",
    }),
    is_fictitious: checkbox(),
    notes: optionalText(2000),
  })
  .refine((v) => !v.effective_from || !v.effective_until || v.effective_from <= v.effective_until, {
    path: ["effective_until"],
    error: "O fim da vigência é anterior ao início.",
  })

export async function createLegalDocument(
  municipalityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = legalDocumentSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)

  const supabase = await adminClient()
  const { error } = await supabase
    .from("legal_documents")
    .insert({ ...parsed.data, municipality_id: municipalityId })
  if (error) return dbErrorState(error)
  refresh()
  return { ok: true, message: "Documento cadastrado.", savedAt: Date.now() }
}

export async function deleteLegalDocument(id: string): Promise<FormState> {
  const supabase = await adminClient()
  const { error } = await supabase.from("legal_documents").delete().eq("id", id)
  if (error) {
    return error.code === "23503"
      ? { error: "Este documento é fonte de regras cadastradas e não pode ser removido." }
      : dbErrorState(error)
  }
  refresh()
  return { ok: true, message: "Documento removido." }
}

// Zonas -----------------------------------------------------------------------------

const zoneSchema = z.object({
  municipality_id: requiredUuid(),
  code: requiredText("Informe o código da zona.", 40),
  name: requiredText("Informe o nome.", 200),
  kind: requiredEnum(enumKeys(ZONE_KIND)),
  description: optionalText(2000),
  legal_document_id: optionalUuid(),
  geometry: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v : null),
    multiPolygonFromString.nullable(),
  ),
  replace_geometry: checkbox(),
})

export async function saveZone(
  zoneId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = zoneSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)
  const { geometry, replace_geometry, ...data } = parsed.data

  const supabase = await adminClient()
  const { data: id, error } = await supabase.rpc("admin_save_zone", {
    p_id: zoneId ?? NEW,
    p_data: data as Json,
    p_geojson: geometry as Json,
    p_replace_geometry: zoneId === null || replace_geometry,
  })
  if (error) return dbErrorState(error)

  if (zoneId === null) redirect(`/admin/zonas/${id}`)
  refresh()
  return { ok: true, message: "Zona salva." }
}

// Regras ----------------------------------------------------------------------------

export async function saveZoningRule(
  ruleId: string | null,
  zoneId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseRuleForm(formDataToObject(formData))
  if (!parsed.ok) return { error: "Revise os campos destacados.", fieldErrors: parsed.fieldErrors }
  const { values, sources, validate } = parsed.data

  const supabase = await adminClient()
  const { data: id, error } = await supabase.rpc("admin_save_zoning_rule", {
    p_id: ruleId ?? NEW,
    p_zone_id: zoneId,
    p_data: values as Json,
    p_sources: sources as Json,
    p_validate: validate,
  })
  if (error) return dbErrorState(error)

  const message = validate
    ? "Regra validada. Ela já alimenta o motor de viabilidade."
    : "Rascunho salvo. Rascunhos não alimentam o motor."
  if (ruleId === null) redirect(`/admin/regras/${id}?salvo=${validate ? "validada" : "rascunho"}`)
  refresh()
  return { ok: true, message }
}

export async function archiveZoningRule(ruleId: string): Promise<FormState> {
  const supabase = await adminClient()
  const { error } = await supabase
    .from("zoning_rules")
    .update({ status: "arquivado" })
    .eq("id", ruleId)
  if (error) return dbErrorState(error)
  refresh()
  return { ok: true, message: "Regra arquivada. Ela deixou de alimentar o motor." }
}

// Terrenos --------------------------------------------------------------------------

export async function saveLand(
  landId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = landFormSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)
  const { data, geojson, owner } = toLandRpcArgs(parsed.data)

  const supabase = await adminClient()
  const { data: id, error } = await supabase.rpc("admin_save_land", {
    p_id: landId ?? NEW,
    p_data: data as Json,
    p_geojson: geojson as Json,
    p_owner: owner as Json,
  })
  if (error) return dbErrorState(error)

  if (landId === null) redirect(`/admin/terrenos/${id}?salvo=1`)
  refresh()
  return { ok: true, message: "Terreno salvo. Zona e área recalculadas." }
}

export type GeometryPreview = {
  zones: { zone_id: string; code: string; name: string; overlap_ratio: number }[]
  environmental: { kind: string; name: string; overlap_m2: number; is_fictitious: boolean }[]
  error?: string
}

/** Prévia ao desenhar: zonas e camadas ambientais que o polígono cruza. */
export async function previewLandGeometry(
  geometry: unknown,
  municipalityId: string,
): Promise<GeometryPreview> {
  let multi
  try {
    multi = toMultiPolygon(geometry)
    z.uuid().parse(municipalityId)
  } catch {
    return { zones: [], environmental: [], error: "Geometria ou município inválido." }
  }

  const supabase = await adminClient()
  const [zones, env] = await Promise.all([
    supabase.rpc("identify_zones", { p_geojson: multi as Json, p_municipality_id: municipalityId }),
    supabase.rpc("environmental_hits", {
      p_geojson: multi as Json,
      p_municipality_id: municipalityId,
    }),
  ])
  if (zones.error || env.error) {
    return { zones: [], environmental: [], error: "Não foi possível consultar as zonas agora." }
  }
  return {
    zones: zones.data.map(({ zone_id, code, name, overlap_ratio }) => ({
      zone_id,
      code,
      name,
      overlap_ratio,
    })),
    environmental: env.data.map(({ kind, name, overlap_m2, is_fictitious }) => ({
      kind,
      name,
      overlap_m2,
      is_fictitious,
    })),
  }
}

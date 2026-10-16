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
import { RULE_FIELDS } from "@/lib/domain/zoning-rule-fields"
import { multiPolygonFromString, toMultiPolygon } from "@/lib/geo/geojson"
import { conflitosDeFonte } from "@/lib/legislacao/conflitos"
import { localizarTrecho } from "@/lib/legislacao/trechos"
import type { Json } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

import { landFormSchema, toLandRpcArgs } from "./land-input"
import { parseRuleForm, type RuleSource } from "./rule-input"

/** As funções RPC aceitam p_id nulo para "criar"; o tipo gerado não reflete isso. */
const NEW = null as unknown as string
/** UUID que não existe: "nenhuma regra a excluir" no filtro de regra validada atual. */
const NEW_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000"

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

  // Fonte que diverge da regra validada atual, vinda de outra norma, exige
  // resolução documentada antes de homologar (Blueprint v2.2, p. 8 e 17).
  if (validate) {
    const { data: atual } = await supabase
      .from("zoning_rules")
      .select(
        `id, ${RULE_FIELDS.map((f) => f.key).join(", ")}, rule_sources(field, legal_document_id)`,
      )
      .eq("zone_id", zoneId)
      .eq("use_type", values.use_type)
      .eq("status", "validado")
      .neq("id", ruleId ?? NEW_ID_PLACEHOLDER)
      .maybeSingle()
    if (atual) {
      const fontesAtuais = Object.fromEntries(
        (
          atual as unknown as { rule_sources: { field: string; legal_document_id: string }[] }
        ).rule_sources.map((f) => [f.field, f]),
      )
      const conflitos = conflitosDeFonte(
        { valores: values, fontes: Object.fromEntries(sources.map((f) => [f.field, f])) },
        { valores: atual as unknown as Record<string, unknown>, fontes: fontesAtuais },
      ).filter((c) => !sources.find((f) => f.field === c.campo)?.resolution_note)
      if (conflitos.length > 0) {
        return {
          error:
            "Há conflito de fontes com a regra validada atual. Registre a resolução nos campos destacados.",
          fieldErrors: Object.fromEntries(
            conflitos.map((c) => [
              `src_${c.campo}`,
              [
                "A regra validada usa outra norma com valor diferente. Explique qual prevalece e por quê.",
              ],
            ]),
          ),
        }
      }
    }
  }

  const { data: id, error } = await supabase.rpc("admin_save_zoning_rule", {
    p_id: ruleId ?? NEW,
    p_zone_id: zoneId,
    p_data: values as Json,
    p_sources: (await conferirTrechos(supabase, sources)) as Json,
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

/**
 * Confere, no texto da página citada (e vizinhas), se o trecho de cada fonte
 * existe. Sem página ou sem texto daquela norma, fica "não conferido" (null).
 */
async function conferirTrechos(
  supabase: Awaited<ReturnType<typeof adminClient>>,
  sources: RuleSource[],
): Promise<(RuleSource & { excerpt_verified: boolean | null })[]> {
  const comPagina = sources.filter((f) => f.page && f.excerpt)
  const docs = [...new Set(comPagina.map((f) => f.legal_document_id))]
  const paginas = [...new Set(comPagina.flatMap((f) => [f.page! - 1, f.page!, f.page! + 1]))]
  const textos = new Map<string, Map<number, string>>()
  if (docs.length > 0) {
    const { data } = await supabase
      .from("legal_document_pages")
      .select("legal_document_id, page_number, content")
      .in("legal_document_id", docs)
      .in("page_number", paginas)
    for (const p of data ?? []) {
      if (!textos.has(p.legal_document_id)) textos.set(p.legal_document_id, new Map())
      textos.get(p.legal_document_id)!.set(p.page_number, p.content)
    }
  }
  return sources.map((f) => {
    const doc = textos.get(f.legal_document_id)
    if (!f.page || !f.excerpt || !doc) return { ...f, excerpt_verified: null }
    return { ...f, excerpt_verified: localizarTrecho(f.excerpt, f.page, doc).encontrado }
  })
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

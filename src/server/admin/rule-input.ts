import { z } from "zod"

import { enumKeys, LAND_USE } from "@/lib/domain/labels"
import { RULE_FIELDS, type RuleFieldKey } from "@/lib/domain/zoning-rule-fields"
import { formatFormula, tryParseFormula } from "@/lib/formula"
import {
  checkbox,
  optionalDecimal,
  optionalPercentAsFraction,
  optionalText,
  optionalUuid,
  requiredEnum,
} from "@/lib/forms"

/**
 * Leitura e validação do formulário de regra urbanística (sem I/O, testável).
 * Fonte por campo: src_<campo>_doc, _article, _excerpt, _page, _condition e
 * _resolution (resolução de conflito com a regra validada, Fase 5).
 */

const formulaField = () =>
  optionalText(200).transform((value, ctx) => {
    if (value === null) return null
    const parsed = tryParseFormula(value)
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error.message })
      return z.NEVER
    }
    return formatFormula(parsed.expr)
  })

function valueSchema(field: (typeof RULE_FIELDS)[number]) {
  switch (field.kind) {
    case "boolean":
      return checkbox()
    case "percent":
      return optionalPercentAsFraction()
    case "integer":
      return optionalDecimal({ min: field.min, max: field.max, integer: true })
    case "decimal":
      return optionalDecimal({ min: field.min, max: field.max })
    case "formula":
      return formulaField()
  }
}

const sourceSchema = z.object({
  legal_document_id: optionalUuid(),
  article: optionalText(200),
  excerpt: optionalText(2000),
  page: optionalDecimal({ min: 1, max: 5000, integer: true }),
  condition: optionalText(500),
  resolution_note: optionalText(1000),
})

const baseSchema = z.object({
  use_type: requiredEnum(enumKeys(LAND_USE), "Selecione o uso."),
  use_label_local: optionalText(200),
  observacoes: optionalText(5000),
  validation_note: optionalText(2000),
  ...Object.fromEntries(RULE_FIELDS.map((f) => [f.key, valueSchema(f)])),
})

export type RuleValues = {
  use_type: keyof typeof LAND_USE
  use_label_local: string | null
  observacoes: string | null
  validation_note: string | null
} & Record<RuleFieldKey, number | string | boolean | null>

export type RuleSource = {
  field: RuleFieldKey
  legal_document_id: string
  article: string
  excerpt: string | null
  page: number | null
  condition: string | null
  resolution_note: string | null
}

export type ParsedRule = { values: RuleValues; sources: RuleSource[]; validate: boolean }

export function parseRuleForm(
  input: Record<string, FormDataEntryValue | undefined>,
): { ok: true; data: ParsedRule } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {}
  const addError = (key: string, message: string) => (fieldErrors[key] ??= []).push(message)

  const base = baseSchema.safeParse(input)
  if (!base.success) {
    for (const issue of base.error.issues) addError(issue.path.join("."), issue.message)
  }

  const validate = input.intent === "validar"
  const values = (base.success ? base.data : {}) as RuleValues
  const sources: RuleSource[] = []

  for (const field of RULE_FIELDS) {
    const src = sourceSchema.safeParse({
      legal_document_id: input[`src_${field.key}_doc`],
      article: input[`src_${field.key}_article`],
      excerpt: input[`src_${field.key}_excerpt`],
      page: input[`src_${field.key}_page`],
      condition: input[`src_${field.key}_condition`],
      resolution_note: input[`src_${field.key}_resolution`],
    })
    if (!src.success) {
      addError(`src_${field.key}`, src.error.issues[0]?.message ?? "Fonte inválida.")
      continue
    }
    const { legal_document_id, article, excerpt, page, condition, resolution_note } = src.data
    if (legal_document_id && article) {
      sources.push({
        field: field.key,
        legal_document_id,
        article,
        excerpt,
        page: page as number | null,
        condition,
        resolution_note,
      })
    } else if (legal_document_id || article || excerpt) {
      addError(`src_${field.key}`, "Informe a lei e o artigo da fonte.")
    } else if (validate && base.success && hasValue(values[field.key])) {
      // Princípio 3: parâmetro validado sempre tem fonte.
      addError(`src_${field.key}`, "Para validar, cite a lei e o artigo deste parâmetro.")
    }
  }

  if (validate && base.success && !values.validation_note) {
    // Homologação documentada (Blueprint v2.2, p. 22): quem conferiu e com base em quê.
    addError("validation_note", "Registre quem conferiu e com base em quê.")
  }

  if (base.success) {
    const { ca_min, ca_basico, ca_max } = values as Record<string, number | null>
    if (ca_min != null && ca_basico != null && ca_min > ca_basico) {
      addError("ca_min", "O CA mínimo não pode ser maior que o básico.")
    }
    if (ca_basico != null && ca_max != null && ca_basico > ca_max) {
      addError("ca_max", "O CA máximo não pode ser menor que o básico.")
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, data: { values, sources, validate } }
}

function hasValue(v: unknown) {
  return v !== null && v !== undefined && v !== ""
}

/**
 * Campos de uma regra urbanística (zona × uso). Usado pelo formulário do
 * admin, pela validação e pela exibição de fontes. Chaves = colunas de
 * public.zoning_rules e valores aceitos em rule_sources.field.
 */
export type RuleFieldKind = "boolean" | "decimal" | "integer" | "percent" | "formula"

export type RuleField = {
  key: string
  label: string
  kind: RuleFieldKind
  unit?: string
  hint?: string
  min?: number
  max?: number
}

export const RULE_FIELDS = [
  { key: "permitted", label: "Uso permitido na zona", kind: "boolean" },
  { key: "ca_min", label: "CA mínimo", kind: "decimal", min: 0, max: 50 },
  { key: "ca_basico", label: "CA básico", kind: "decimal", min: 0, max: 50 },
  {
    key: "ca_max",
    label: "CA máximo",
    kind: "decimal",
    min: 0,
    max: 50,
    hint: "Acima do básico, exige outorga onerosa.",
  },
  { key: "to_max", label: "Taxa de ocupação máxima", kind: "percent", unit: "%" },
  { key: "permeabilidade_min", label: "Taxa de permeabilidade mínima", kind: "percent", unit: "%" },
  {
    key: "gabarito_m",
    label: "Gabarito (altura máxima)",
    kind: "decimal",
    unit: "m",
    min: 0,
    max: 1000,
  },
  { key: "gabarito_pavimentos", label: "Gabarito (pavimentos)", kind: "integer", min: 1, max: 300 },
  {
    key: "recuo_frontal",
    label: "Recuo frontal",
    kind: "formula",
    unit: "m",
    hint: "Número ou fórmula, ex.: 5 ou max(H/10, 3).",
  },
  {
    key: "recuo_lateral",
    label: "Recuo lateral",
    kind: "formula",
    unit: "m",
    hint: "Ex.: max(H/10, 3).",
  },
  { key: "recuo_fundos", label: "Recuo de fundos", kind: "formula", unit: "m", hint: "Ex.: 3." },
  {
    key: "lote_minimo_m2",
    label: "Lote mínimo",
    kind: "decimal",
    unit: "m²",
    min: 0,
    max: 10_000_000,
  },
  {
    key: "testada_minima_m",
    label: "Testada mínima",
    kind: "decimal",
    unit: "m",
    min: 0,
    max: 10_000,
  },
  { key: "outorga_fator", label: "Fator de outorga onerosa", kind: "decimal", min: 0, max: 100 },
  {
    key: "outorga_formula",
    label: "Fórmula da outorga",
    kind: "formula",
    hint: "Opcional. Variáveis: A (área do terreno), H, P, T.",
  },
] as const satisfies readonly RuleField[]

export type RuleFieldKey = (typeof RULE_FIELDS)[number]["key"]

export const RULE_FIELD_LABELS: Record<RuleFieldKey, string> = Object.fromEntries(
  RULE_FIELDS.map((f) => [f.key, f.label]),
) as Record<RuleFieldKey, string>

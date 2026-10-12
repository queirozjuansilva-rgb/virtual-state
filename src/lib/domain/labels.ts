import type { Enums } from "@/lib/supabase/database.types"

/** Rótulos pt-BR dos enums do banco. Uma fonte só para UI e validação. */

export const LAND_STATUS = {
  disponivel: "Disponível",
  em_negociacao: "Em negociação",
  reservado: "Reservado",
  vendido: "Vendido",
  indisponivel: "Indisponível",
} as const satisfies Record<Enums<"land_status">, string>

export const NEGOTIATION_TYPE = {
  dinheiro: "Dinheiro",
  permuta_fisica: "Permuta física",
  permuta_financeira: "Permuta financeira",
  misto: "Misto",
} as const satisfies Record<Enums<"negotiation_type">, string>

export const TOPOGRAPHY = {
  plano: "Plano",
  aclive: "Aclive",
  declive: "Declive",
  irregular: "Irregular",
} as const satisfies Record<Enums<"topography">, string>

export const LAND_SHAPE = {
  retangular: "Retangular",
  trapezoidal: "Trapezoidal",
  irregular: "Irregular",
} as const satisfies Record<Enums<"land_shape">, string>

export const COVERAGE_STATUS = {
  sem_cobertura: "Sem cobertura",
  em_implantacao: "Em implantação",
  coberto: "Coberto",
} as const satisfies Record<Enums<"coverage_status">, string>

export const LEGAL_DOCUMENT_KIND = {
  lei: "Lei",
  lei_complementar: "Lei complementar",
  decreto: "Decreto",
  resolucao: "Resolução",
  instrucao_normativa: "Instrução normativa",
  outro: "Outro",
} as const satisfies Record<Enums<"legal_document_kind">, string>

export const ZONE_KIND = {
  zona: "Zona",
  macrozona: "Macrozona",
  zeis: "ZEIS",
  zona_especial: "Zona especial",
  outro: "Outro",
} as const satisfies Record<Enums<"zone_kind">, string>

export const LAND_USE = {
  residencial_vertical: "Residencial vertical",
  residencial_horizontal: "Residencial horizontal",
  comercial: "Comercial",
  servicos: "Serviços",
  misto: "Misto (fachada ativa)",
  industrial: "Industrial",
  institucional: "Institucional",
} as const satisfies Record<Enums<"land_use">, string>

export const RULE_STATUS = {
  rascunho: "Rascunho",
  validado: "Validado",
  arquivado: "Arquivado",
} as const satisfies Record<Enums<"rule_status">, string>

export const ENVIRONMENTAL_LAYER_KIND = {
  app: "APP",
  area_alagavel: "Área alagável",
  zona_protecao_ambiental: "Zona de proteção ambiental",
  faixa_nao_edificavel: "Faixa não edificável",
  faixa_dominio: "Faixa de domínio",
  tombamento: "Tombamento",
  outro: "Outra restrição",
} as const satisfies Record<Enums<"environmental_layer_kind">, string>

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const

/** Lista [valor, rótulo] para selects. */
export function options<T extends Record<string, string>>(labels: T) {
  return Object.entries(labels) as [keyof T & string, string][]
}

export function enumKeys<T extends Record<string, string>>(labels: T) {
  return Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]
}

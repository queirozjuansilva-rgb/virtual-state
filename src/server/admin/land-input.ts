import { z } from "zod"

import {
  enumKeys,
  LAND_SHAPE,
  LAND_STATUS,
  NEGOTIATION_TYPE,
  TOPOGRAPHY,
} from "@/lib/domain/labels"
import { parseDecimal } from "@/lib/format"
import {
  checkbox,
  optionalDecimal,
  optionalEnum,
  optionalPercentAsFraction,
  optionalText,
  optionalUuid,
  requiredEnum,
  requiredText,
  requiredUuid,
} from "@/lib/forms"
import { multiPolygonFromString } from "@/lib/geo/geojson"

/** Leitura e validação do formulário de terreno (sem I/O, testável). */

const cep = optionalText(20).transform((value, ctx) => {
  if (value === null) return null
  const digits = value.replace(/\D/g, "")
  if (digits.length !== 8) {
    ctx.addIssue({ code: "custom", message: "CEP deve ter 8 dígitos." })
    return z.NEVER
  }
  return digits
})

/** Testadas adicionais: "20; 12,5" → [20, 12.5]. */
const testadas = optionalText(200).transform((value, ctx) => {
  if (value === null) return []
  const parts = value.split(";").map((p) => parseDecimal(p))
  if (parts.some((n) => n === null || Number.isNaN(n) || n <= 0)) {
    ctx.addIssue({
      code: "custom",
      message: "Separe as testadas por ponto e vírgula, ex.: 20; 12,5.",
    })
    return z.NEVER
  }
  return parts as number[]
})

const geometry = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v : null),
  multiPolygonFromString.nullable(),
)

const email = optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, {
  error: "E-mail inválido.",
})

export const landFormSchema = z
  .object({
    code: requiredText("Informe o código interno.", 40),
    address: requiredText("Informe o endereço.", 300),
    neighborhood: optionalText(120),
    municipality_id: requiredUuid("Selecione o município."),
    cep,
    geometry,
    area_informada_m2: optionalDecimal({ min: 1, max: 100_000_000 }),
    testada_principal_m: optionalDecimal({ min: 0.1, max: 100_000 }),
    testadas_m: testadas,
    topografia: optionalEnum(enumKeys(TOPOGRAPHY)),
    declividade_pct: optionalDecimal({ min: 0, max: 100 }),
    formato: optionalEnum(enumKeys(LAND_SHAPE)),
    esquina: checkbox(),
    matricula_numero: optionalText(60),
    cartorio: optionalText(200),
    onus: optionalText(2000),
    status: requiredEnum(enumKeys(LAND_STATUS), "Selecione a situação."),
    preco_pedido: optionalDecimal({ min: 0 }),
    negociacao: optionalEnum(enumKeys(NEGOTIATION_TYPE)),
    permuta_pct: optionalPercentAsFraction(),
    zone_assignment: requiredEnum(["automatica", "manual"] as const),
    zone_id: optionalUuid(),
    tem_app: checkbox(),
    tem_area_alagavel: checkbox(),
    tem_faixa_dominio: checkbox(),
    tem_tombamento: checkbox(),
    tem_servidao: checkbox(),
    restricoes_obs: optionalText(2000),
    observacoes: optionalText(5000),
    owner_name: optionalText(200),
    owner_phone: optionalText(60),
    owner_email: email,
    owner_notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.geometry && v.area_informada_m2 === null) {
      ctx.addIssue({
        code: "custom",
        path: ["geometry"],
        message: "Desenhe ou importe o polígono do lote, ou informe a área.",
      })
    }
    if (v.zone_assignment === "manual" && !v.zone_id) {
      ctx.addIssue({ code: "custom", path: ["zone_id"], message: "Selecione a zona." })
    }
    const usesPermuta = v.negociacao && v.negociacao !== "dinheiro"
    if (usesPermuta && v.permuta_pct === null) {
      ctx.addIssue({
        code: "custom",
        path: ["permuta_pct"],
        message: "Informe o percentual de permuta.",
      })
    }
  })

export type LandForm = z.infer<typeof landFormSchema>

/** Separa o formulário nos três argumentos de public.admin_save_land. */
export function toLandRpcArgs(v: LandForm) {
  const { geometry, owner_name, owner_phone, owner_email, owner_notes, ...rest } = v
  const hasOwner = owner_name || owner_phone || owner_email || owner_notes
  return {
    data: {
      ...rest,
      // Na atribuição automática, a zona é calculada pelo banco.
      zone_id: rest.zone_assignment === "manual" ? rest.zone_id : null,
      permuta_pct: rest.negociacao && rest.negociacao !== "dinheiro" ? rest.permuta_pct : null,
    },
    geojson: geometry,
    owner: hasOwner
      ? { owner_name, phone: owner_phone, email: owner_email, notes: owner_notes }
      : null,
  }
}

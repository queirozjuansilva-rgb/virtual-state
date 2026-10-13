"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { requireUser } from "@/lib/auth/dal"
import { enumKeys, LAND_USE } from "@/lib/domain/labels"
import {
  dbErrorState,
  formDataToObject,
  optionalDecimal,
  optionalEnum,
  optionalPercentAsFraction,
  optionalText,
  zodErrorState,
  type FormState,
} from "@/lib/forms"
import { createClient } from "@/lib/supabase/server"

const USOS = enumKeys(LAND_USE)
const MODELOS = ["compra", "permuta"] as const

const perfilSchema = z
  .object({
    ticket_min: optionalDecimal({ min: 0 }),
    ticket_max: optionalDecimal({ min: 0 }),
    min_margin: optionalPercentAsFraction(),
    risk_tolerance: optionalEnum(["baixa", "media", "alta"] as const),
    horizon_months: optionalDecimal({ min: 1, max: 600, integer: true }),
    regions: optionalText(500).transform((s) =>
      s
        ? [
            ...new Set(
              s
                .split(/[,;\n]/)
                .map((r) => r.trim())
                .filter(Boolean),
            ),
          ].slice(0, 30)
        : [],
    ),
  })
  .refine((p) => p.ticket_min === null || p.ticket_max === null || p.ticket_min <= p.ticket_max, {
    path: ["ticket_max"],
    error: "O ticket máximo deve ser maior ou igual ao mínimo.",
  })

/** Salva o perfil do investidor do usuário (um por usuário). */
export async function salvarPerfil(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = perfilSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return zodErrorState(parsed.error)

  const supabase = await createClient()
  const { data: membro } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()
  if (!membro) return { error: "Sua conta não está ligada a uma organização." }

  const { error } = await supabase.from("investor_profiles").upsert(
    {
      user_id: user.id,
      organization_id: membro.organization_id,
      ...parsed.data,
      typologies: USOS.filter((u) => formData.get(`tipologia_${u}`) === "on"),
      acquisition_models: MODELOS.filter((m) => formData.get(`aquisicao_${m}`) === "on"),
    },
    { onConflict: "user_id" },
  )
  if (error) return dbErrorState(error)
  refresh()
  return { ok: true, message: "Perfil salvo. O copiloto passa a usá-lo nas próximas mensagens." }
}

"use server"

import { z } from "zod"

import { requireUser } from "@/lib/auth/dal"
import {
  calcularViabilidade,
  ranquearUsos,
  type CandidatoRanqueado,
  type ResultadoViabilidade,
  type Uso,
} from "@/lib/feasibility"
import { createClient } from "@/lib/supabase/server"

import { carregarContexto } from "./carregar-contexto"
import { registrarExecucao } from "./registro"
import { montarEntrada } from "./montar-entrada"

const USOS = [
  "residencial_vertical",
  "residencial_horizontal",
  "comercial",
  "servicos",
  "misto",
  "industrial",
  "institucional",
] as const satisfies readonly Uso[]

const pedidoSchema = z.object({
  landId: z.uuid(),
  /** Sem uso: estuda todos os usos com regra validada na zona (melhor uso). */
  uso: z.enum(USOS).optional(),
  precoVendaM2: z.number().positive().max(1_000_000).nullable().optional(),
  usarCaMaximo: z.boolean().optional(),
})

export type PedidoEstudo = z.input<typeof pedidoSchema>

export type EstudoUso =
  | {
      uso: Uso
      ok: true
      resultado: ResultadoViabilidade
      /** Avisos da montagem (dados de teste, CUB aproximado…) + do motor. */
      avisos: string[]
      runId: string | null
    }
  | { uso: Uso; ok: false; pendencias: string[]; avisos: string[] }

export type RespostaEstudo =
  { ok: true; estudos: EstudoUso[]; ranking: CandidatoRanqueado[] } | { ok: false; erro: string }

/**
 * Roda o motor de viabilidade para um terreno e grava cada execução em
 * analysis_runs (entrada, saída e versão do motor) para calibração.
 */
export async function estudarTerreno(pedido: PedidoEstudo): Promise<RespostaEstudo> {
  await requireUser()
  const parsed = pedidoSchema.safeParse(pedido)
  if (!parsed.success) return { ok: false, erro: "Pedido de estudo inválido." }
  const { landId, uso, precoVendaM2, usarCaMaximo } = parsed.data

  const supabase = await createClient()
  let ctx
  try {
    ctx = await carregarContexto(supabase, landId, uso ? [uso] : undefined)
  } catch (error) {
    console.error(error)
    return { ok: false, erro: "Não foi possível carregar os dados do terreno." }
  }
  if (!ctx) return { ok: false, erro: "Terreno não encontrado ou sem permissão de acesso." }

  const usos = uso ? [uso] : [...new Set(ctx.regras.map((r) => r.use_type))]
  if (usos.length === 0) {
    return {
      ok: false,
      erro: ctx.terreno.zone
        ? `A zona ${ctx.terreno.zone.code} não tem regras validadas.`
        : "O lote não tem zona identificada: atribua a zona antes de rodar o estudo.",
    }
  }

  const estudos: EstudoUso[] = []
  for (const u of usos) {
    const montada = montarEntrada(ctx, { uso: u, precoVendaM2, usarCaMaximo })
    if (!montada.ok) {
      estudos.push({ uso: u, ok: false, pendencias: montada.pendencias, avisos: montada.avisos })
      continue
    }
    const resultado = calcularViabilidade(montada.entrada)
    const runId = await registrarExecucao(supabase, {
      landId,
      entrada: montada.entrada,
      resultado,
    })
    estudos.push({
      uso: u,
      ok: true,
      resultado,
      avisos: [...montada.avisos, ...resultado.avisos],
      runId,
    })
  }

  const ranking = ranquearUsos(
    estudos.filter((e): e is Extract<EstudoUso, { ok: true }> => e.ok).map((e) => e.resultado),
  )
  return { ok: true, estudos, ranking }
}

"use server"

import { randomBytes } from "node:crypto"

import { refresh } from "next/cache"
import { z } from "zod"

import { requireUser } from "@/lib/auth/dal"
import {
  calcularViabilidade,
  type EntradaViabilidade,
  type ResultadoViabilidade,
} from "@/lib/feasibility"
import { aplicarEdicoes, type ChaveEditavel, type ErrosEdicao } from "@/lib/relatorio/edicao"
import type { ContextoEstudo } from "@/lib/relatorio/tipos"
import type { Json } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"
import { registrarExecucao } from "@/server/feasibility/registro"

import { criarRelatorioDoEstudo } from "./criar"

const uuid = z.uuid()

// Criar --------------------------------------------------------------------------------

export type RespostaCriacao = { ok: true; id: string } | { ok: false; erro: string }

/** Cria (ou reabre) o relatório de um estudo registrado. */
export async function criarRelatorio(analysisRunId: string): Promise<RespostaCriacao> {
  await requireUser()
  if (!uuid.safeParse(analysisRunId).success) return { ok: false, erro: "Estudo inválido." }
  const relatorio = await criarRelatorioDoEstudo(await createClient(), analysisRunId)
  if (!relatorio) return { ok: false, erro: "Não foi possível criar o relatório deste estudo." }
  return { ok: true, id: relatorio.id }
}

// Recalcular e salvar ----------------------------------------------------------------

const pedidoSchema = z.object({
  relatorioId: uuid,
  versao: z.number().int().positive(),
  edicoes: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
})

export type PedidoRecalculo = z.input<typeof pedidoSchema>

export type RespostaRecalculo =
  | { ok: true; resultado: ResultadoViabilidade; alteradas: ChaveEditavel[]; tempoMotorMs: number }
  | { ok: false; erros: ErrosEdicao }

type Supabase = Awaited<ReturnType<typeof createClient>>

async function entradaDaVersao(
  supabase: Supabase,
  relatorioId: string,
  versao: number,
): Promise<EntradaViabilidade | null> {
  const { data } = await supabase
    .from("report_versions")
    .select("input")
    .eq("report_id", relatorioId)
    .eq("version", versao)
    .maybeSingle()
  return data ? (data.input as unknown as EntradaViabilidade) : null
}

function recalcular(
  entrada: EntradaViabilidade,
  edicoes: Record<string, number | string | boolean>,
) {
  const editada = aplicarEdicoes(entrada, edicoes)
  if (!editada.ok) return editada
  const inicio = performance.now()
  const resultado = calcularViabilidade(editada.entrada)
  return {
    ok: true as const,
    entrada: editada.entrada,
    alteradas: editada.alteradas,
    resultado,
    tempoMotorMs: performance.now() - inicio,
  }
}

/**
 * Recalcula com as variáveis editadas, sem gravar (rascunho). Sem consulta de
 * perfil (aceite: < 1 s): a RLS só devolve a versão a quem pode vê-la.
 */
export async function recalcularRelatorio(pedido: PedidoRecalculo): Promise<RespostaRecalculo> {
  const parsed = pedidoSchema.safeParse(pedido)
  if (!parsed.success) return { ok: false, erros: { geral: "Pedido inválido." } }
  const { relatorioId, versao, edicoes } = parsed.data

  const supabase = await createClient()
  const entrada = await entradaDaVersao(supabase, relatorioId, versao)
  if (!entrada) return { ok: false, erros: { geral: "Versão não encontrada." } }

  const r = recalcular(entrada, edicoes)
  if (!r.ok) return r
  return { ok: true, resultado: r.resultado, alteradas: r.alteradas, tempoMotorMs: r.tempoMotorMs }
}

export type RespostaSalvar = { ok: true; versao: number } | { ok: false; erros: ErrosEdicao }

/**
 * Salva as edições como nova versão: recalcula no servidor (o cliente não
 * manda números), registra a execução em analysis_runs e grava a versão.
 */
export async function salvarVersaoRelatorio(pedido: PedidoRecalculo): Promise<RespostaSalvar> {
  await requireUser()
  const parsed = pedidoSchema.safeParse(pedido)
  if (!parsed.success) return { ok: false, erros: { geral: "Pedido inválido." } }
  const { relatorioId, versao, edicoes } = parsed.data

  const supabase = await createClient()
  const [{ data: relatorio }, entrada] = await Promise.all([
    supabase.from("reports").select("land_id, contexto").eq("id", relatorioId).maybeSingle(),
    entradaDaVersao(supabase, relatorioId, versao),
  ])
  if (!relatorio || !entrada) return { ok: false, erros: { geral: "Relatório não encontrado." } }

  const r = recalcular(entrada, edicoes)
  if (!r.ok) return r
  if (r.alteradas.length === 0) return { ok: false, erros: { geral: "Nenhuma variável mudou." } }

  const runId = await registrarExecucao(supabase, {
    landId: relatorio.land_id,
    entrada: r.entrada,
    resultado: r.resultado,
    contexto: relatorio.contexto as unknown as ContextoEstudo,
  })
  const { data: nova, error } = await supabase.rpc("salvar_versao_relatorio", {
    p_report_id: relatorioId,
    p_versao_base: versao,
    p_input: r.entrada as unknown as Json,
    p_output: r.resultado as unknown as Json,
    p_engine_version: r.resultado.versaoMotor,
    p_analysis_run_id: runId as string,
  })
  if (error || !nova) {
    if (error?.hint === "versao_desatualizada") {
      return {
        ok: false,
        erros: { geral: `${error.message} Recarregue a página para ver a versão nova.` },
      }
    }
    console.error(error)
    return { ok: false, erros: { geral: "Não foi possível salvar a versão." } }
  }
  refresh()
  return { ok: true, versao: nova }
}

// Compartilhar -------------------------------------------------------------------------

export type RespostaCompartilhar = { ok: true; token: string | null } | { ok: false; erro: string }

/** Liga (gera um token novo) ou desliga o link somente leitura. */
export async function alternarCompartilhamento(
  relatorioId: string,
  ativo: boolean,
): Promise<RespostaCompartilhar> {
  await requireUser()
  if (!uuid.safeParse(relatorioId).success) return { ok: false, erro: "Relatório inválido." }
  const token = ativo ? randomBytes(32).toString("base64url") : null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reports")
    .update({ share_token: token })
    .eq("id", relatorioId)
    .select("id")
    .maybeSingle()
  if (error || !data) {
    // Só código e mensagem: `details` de violação de restrição traz a linha, com o token.
    console.error("compartilhamento do relatório", { code: error?.code, message: error?.message })
    return { ok: false, erro: "Não foi possível alterar o compartilhamento." }
  }
  refresh()
  return { ok: true, token }
}

// Revisão de analista ------------------------------------------------------------------

const revisaoSchema = z
  .object({
    relatorioId: uuid,
    versaoId: uuid,
    veredito: z.enum(["conferido", "divergente"]),
    comentario: z.string().trim().max(2000).optional(),
  })
  .refine((r) => r.veredito === "conferido" || (r.comentario?.length ?? 0) > 0, {
    path: ["comentario"],
    error: "Explique a divergência.",
  })

export type RespostaRevisao = { ok: true } | { ok: false; erro: string }

/** "Conferido" ou "divergente + comentário" (analista ou admin; a RLS confere). */
export async function registrarRevisao(
  pedido: z.input<typeof revisaoSchema>,
): Promise<RespostaRevisao> {
  const user = await requireUser()
  if (user.role !== "analista" && user.role !== "admin") {
    return { ok: false, erro: "Só analistas e administradores registram revisão." }
  }
  const parsed = revisaoSchema.safeParse(pedido)
  if (!parsed.success)
    return { ok: false, erro: parsed.error.issues[0]?.message ?? "Revisão inválida." }
  const { relatorioId, versaoId, veredito, comentario } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from("analyst_reviews").insert({
    report_id: relatorioId,
    report_version_id: versaoId,
    verdict: veredito,
    comment: comentario || null,
  })
  if (error) {
    console.error(error)
    return { ok: false, erro: "Não foi possível registrar a revisão." }
  }
  refresh()
  return { ok: true }
}

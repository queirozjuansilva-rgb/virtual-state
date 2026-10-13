import "server-only"

import {
  ENGINE_VERSION,
  type EntradaViabilidade,
  type ResultadoViabilidade,
} from "@/lib/feasibility"
import type { ContextoEstudo } from "@/lib/relatorio/tipos"
import type { Json } from "@/lib/supabase/database.types"

import type { Supabase } from "./carregar-contexto"

/** Grava a execução do motor em analysis_runs (calibração com analistas). */
export async function registrarExecucao(
  supabase: Supabase,
  params: {
    landId: string | null
    conversationId?: string | null
    entrada: EntradaViabilidade
    resultado: ResultadoViabilidade
    contexto: ContextoEstudo
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("analysis_runs")
    .insert({
      land_id: params.landId,
      conversation_id: params.conversationId ?? null,
      input: params.entrada as unknown as Json,
      output: params.resultado as unknown as Json,
      engine_version: ENGINE_VERSION,
      contexto: params.contexto as unknown as Json,
    })
    .select("id")
    .single()
  if (error) {
    console.error("Falha ao registrar analysis_run:", error.message)
    return null
  }
  return data.id
}

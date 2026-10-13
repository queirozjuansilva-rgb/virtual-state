import "server-only"

import { LAND_USE } from "@/lib/domain/labels"
import type { ContextoEstudo } from "@/lib/relatorio/tipos"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

/**
 * Cria (ou reabre, se a organização já tem) o relatório de um estudo
 * registrado. Título: referência · uso. RLS: só estudos visíveis ao usuário.
 */
export async function criarRelatorioDoEstudo(
  supabase: Supabase,
  analysisRunId: string,
): Promise<{ id: string; titulo: string } | null> {
  const { data: run } = await supabase
    .from("analysis_runs")
    .select("contexto")
    .eq("id", analysisRunId)
    .maybeSingle()
  if (!run) return null

  const contexto = run.contexto as Partial<ContextoEstudo>
  const titulo =
    [contexto.referencia, contexto.uso ? LAND_USE[contexto.uso] : null]
      .filter(Boolean)
      .join(" · ") || "Estudo de viabilidade"
  const { data, error } = await supabase.rpc("criar_relatorio", {
    p_analysis_run_id: analysisRunId,
    p_titulo: titulo,
  })
  if (error || !data) {
    console.error(error)
    return null
  }
  return { id: data, titulo }
}

import "server-only"

import type { ResultadoMercado, ResultadoParametros, TerrenoDetalhe } from "@/lib/ai/tipos"
import { consultarMercado } from "@/lib/ai/tools/mercado"
import { obterTerreno } from "@/lib/ai/tools/terrenos"
import { consultarParametros } from "@/lib/ai/tools/zoneamento"
import type { Uso } from "@/lib/feasibility"
import type { Json } from "@/lib/supabase/database.types"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

import { dadosSupabase } from "./dados-supabase"

export type PainelTerreno = {
  terreno: TerrenoDetalhe
  geojson: Json | null
  parametros: ResultadoParametros
  mercado: ResultadoMercado | null
}

/** Residencial vertical quando permitido (o caso mais comum); senão o primeiro uso. */
function usoDoPainel(usos: Uso[]): Uso {
  return usos.includes("residencial_vertical")
    ? "residencial_vertical"
    : (usos[0] ?? "residencial_vertical")
}

/**
 * Painel "Contexto do lote": os mesmos dados que as ferramentas do copiloto
 * devolvem (ficha, parâmetros validados com fonte e mercado), mais o polígono.
 */
export async function carregarPainelTerreno(
  supabase: Supabase,
  landId: string,
): Promise<PainelTerreno | null> {
  const ctx = { dados: dadosSupabase(supabase, null) }
  const t = await ctx.dados.obterTerreno({ id: landId })
  if (!t) return null

  const [ficha, parametros, mercado, geo] = await Promise.all([
    obterTerreno.executar({ terreno: landId }, ctx),
    consultarParametros.executar({ terreno: landId }, ctx),
    consultarMercado
      .executar({ terreno: landId, uso: usoDoPainel(t.usos_permitidos) }, ctx)
      .catch(() => null),
    supabase.from("lands").select("geojson").eq("id", landId).maybeSingle(),
  ])
  return {
    terreno: ficha.resultado as TerrenoDetalhe,
    geojson: geo.data?.geojson ?? null,
    parametros: parametros.resultado as ResultadoParametros,
    mercado: (mercado?.resultado as ResultadoMercado | undefined) ?? null,
  }
}

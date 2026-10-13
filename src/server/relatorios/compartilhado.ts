import "server-only"

import type { EntradaViabilidade, ResultadoViabilidade } from "@/lib/feasibility"
import type { ContextoEstudo, VersaoRelatorio } from "@/lib/relatorio/tipos"
import type { Json } from "@/lib/supabase/database.types"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

export type RelatorioCompartilhado = {
  titulo: string
  organizacao: string
  contexto: Partial<ContextoEstudo>
  versao: VersaoRelatorio
  terreno: {
    codigo: string
    endereco: string
    bairro: string | null
    municipio: string
    uf: string
    geojson: Json | null
    ficticio: boolean
  } | null
}

type Linha = {
  titulo: string
  organizacao: string
  contexto: Partial<ContextoEstudo>
  versao: number
  salvo_em: string
  engine_version: string
  input: EntradaViabilidade
  output: ResultadoViabilidade
  terreno: {
    code: string
    address: string
    neighborhood: string | null
    geojson: Json | null
    is_fictitious: boolean
    municipio: string
    uf: string
  } | null
}

/** Última versão salva de um relatório com link ativo (sem login; função SECURITY DEFINER). */
export async function carregarCompartilhado(
  supabase: Supabase,
  token: string,
): Promise<RelatorioCompartilhado | null> {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null
  const { data, error } = await supabase.rpc("relatorio_compartilhado", { p_token: token })
  if (error) throw new Error(`Falha ao carregar o relatório compartilhado: ${error.message}`)
  if (!data) return null
  const l = data as unknown as Linha
  return {
    titulo: l.titulo,
    organizacao: l.organizacao,
    contexto: l.contexto ?? {},
    versao: {
      id: `${token.slice(0, 8)}-v${l.versao}`,
      versao: l.versao,
      entrada: l.input,
      resultado: l.output,
      versaoMotor: l.engine_version,
      salvaEm: l.salvo_em,
    },
    terreno: l.terreno
      ? {
          codigo: l.terreno.code,
          endereco: l.terreno.address,
          bairro: l.terreno.neighborhood,
          municipio: l.terreno.municipio,
          uf: l.terreno.uf,
          geojson: l.terreno.geojson,
          ficticio: l.terreno.is_fictitious,
        }
      : null,
  }
}

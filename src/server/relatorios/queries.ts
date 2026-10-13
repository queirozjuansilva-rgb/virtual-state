import "server-only"

import type { EntradaViabilidade, ResultadoViabilidade } from "@/lib/feasibility"
import { alteracoesEntre, type Alteracao } from "@/lib/relatorio/edicao"
import type { ContextoEstudo, VersaoRelatorio } from "@/lib/relatorio/tipos"
import type { Enums, Json } from "@/lib/supabase/database.types"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

function falhou(etapa: string, error: { message: string } | null) {
  if (error) throw new Error(`Falha ao carregar ${etapa}: ${error.message}`)
}

export type TerrenoDoRelatorio = {
  id: string
  codigo: string
  endereco: string
  bairro: string | null
  municipio: string
  uf: string
  situacao: Enums<"land_status">
  geojson: Json | null
  ficticio: boolean
}

export type RevisaoRelatorio = {
  id: string
  versao: number | null
  veredito: Enums<"review_verdict">
  comentario: string | null
  revisor: string
  criadaEm: string
}

export type RelatorioCompleto = {
  id: string
  titulo: string
  versaoAtual: number
  tokenCompartilhamento: string | null
  organizacao: string
  contexto: Partial<ContextoEstudo>
  terreno: TerrenoDoRelatorio | null
  /** Versão exibida (a atual, ou a pedida em ?versao=). */
  versao: VersaoRelatorio
  versoes: { versao: number; salvaEm: string; versaoMotor: string; alteracoes: Alteracao[] }[]
  revisoes: RevisaoRelatorio[]
}

/** Relatório com a versão pedida (ou a atual). RLS: só a organização e admin. */
export async function carregarRelatorio(
  supabase: Supabase,
  id: string,
  versaoPedida?: number,
): Promise<RelatorioCompleto | null> {
  const { data: r, error } = await supabase
    .from("reports")
    .select(
      "id, title, current_version, share_token, contexto, land_id, organization:organizations(name), land:lands(id, code, address, neighborhood, status, geojson, is_fictitious, municipality:municipalities(name, uf))",
    )
    .eq("id", id)
    .maybeSingle()
  falhou("o relatório", error)
  if (!r) return null

  const [versoes, revisoes] = await Promise.all([
    supabase
      .from("report_versions")
      .select("id, version, input, output, engine_version, created_at")
      .eq("report_id", id)
      .order("version"),
    supabase.rpc("revisoes_do_relatorio", { p_report_id: id }),
  ])
  falhou("as versões", versoes.error)
  falhou("as revisões", revisoes.error)

  const lista = versoes.data ?? []
  const numero = versaoPedida ?? r.current_version
  const escolhida = lista.find((v) => v.version === numero)
  if (!escolhida) return null

  const land = r.land
  return {
    id: r.id,
    titulo: r.title,
    versaoAtual: r.current_version,
    tokenCompartilhamento: r.share_token,
    organizacao: r.organization?.name ?? "",
    contexto: (r.contexto ?? {}) as Partial<ContextoEstudo>,
    terreno: land
      ? {
          id: land.id,
          codigo: land.code,
          endereco: land.address,
          bairro: land.neighborhood,
          municipio: land.municipality?.name ?? "",
          uf: land.municipality?.uf ?? "",
          situacao: land.status,
          geojson: land.geojson,
          ficticio: land.is_fictitious,
        }
      : null,
    versao: {
      id: escolhida.id,
      versao: escolhida.version,
      entrada: escolhida.input as unknown as EntradaViabilidade,
      resultado: escolhida.output as unknown as ResultadoViabilidade,
      versaoMotor: escolhida.engine_version,
      salvaEm: escolhida.created_at,
    },
    versoes: lista.map((v, i) => ({
      versao: v.version,
      salvaEm: v.created_at,
      versaoMotor: v.engine_version,
      alteracoes:
        i === 0
          ? []
          : alteracoesEntre(
              lista[i - 1].input as unknown as EntradaViabilidade,
              v.input as unknown as EntradaViabilidade,
            ),
    })),
    revisoes: (revisoes.data ?? []).map((x) => ({
      id: x.id,
      versao: x.versao,
      veredito: x.verdict,
      comentario: x.comment,
      revisor: x.revisor,
      criadaEm: x.created_at,
    })),
  }
}

export type ItemRelatorio = {
  id: string
  titulo: string
  versaoAtual: number
  atualizadoEm: string
  compartilhado: boolean
}

export async function listarRelatorios(supabase: Supabase): Promise<ItemRelatorio[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, title, current_version, updated_at, share_token")
    .order("updated_at", { ascending: false })
    .limit(100)
  falhou("os relatórios", error)
  return (data ?? []).map((r) => ({
    id: r.id,
    titulo: r.title,
    versaoAtual: r.current_version,
    atualizadoEm: r.updated_at,
    compartilhado: Boolean(r.share_token),
  }))
}

import "server-only"

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages"

import type { CartaoRegistrado, MensagemRegistrada } from "@/lib/ai/conteudo"
import { LAND_USE } from "@/lib/domain/labels"
import { formatBRL, formatDate, formatPercent } from "@/lib/format"
import type { Json, Tables } from "@/lib/supabase/database.types"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

function falhou(etapa: string, error: { message: string } | null) {
  if (error) throw new Error(`Falha ao ${etapa}: ${error.message}`)
}

export const TITULO_PADRAO = "Nova análise"

export function tituloDaPergunta(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim()
  if (!limpo) return TITULO_PADRAO
  return limpo.length > 60 ? `${limpo.slice(0, 57).trimEnd()}…` : limpo
}

export async function criarConversa(supabase: Supabase, titulo: string) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: titulo })
    .select("id, title, land_id")
    .single()
  falhou("criar a conversa", error)
  return data!
}

export async function obterConversa(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, land_id")
    .eq("id", id)
    .maybeSingle()
  falhou("abrir a conversa", error)
  return data
}

type LinhaMensagem = Pick<
  Tables<"messages">,
  "id" | "role" | "content" | "tool_calls" | "model" | "input_tokens" | "output_tokens"
> & { attachments: { file_name: string }[] }

function paraRegistrada(l: LinhaMensagem): MensagemRegistrada & { id: string; anexos: string[] } {
  const base = { id: l.id, anexos: l.attachments.map((a) => a.file_name) }
  switch (l.role) {
    case "user":
      return { ...base, papel: "user", conteudo: l.content as unknown as BetaContentBlockParam[] }
    case "system":
      return { ...base, papel: "system", conteudo: l.content as string }
    case "assistant":
      return {
        ...base,
        papel: "assistant",
        conteudo: l.content as never,
        modelo: l.model ?? "",
        tokensEntrada: l.input_tokens ?? 0,
        tokensSaida: l.output_tokens ?? 0,
      }
    case "tool":
      return {
        ...base,
        papel: "tool",
        conteudo: l.content as never,
        cartoes: (l.tool_calls ?? []) as unknown as CartaoRegistrado[],
      }
  }
}

export async function carregarMensagens(supabase: Supabase, conversaId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, role, content, tool_calls, model, input_tokens, output_tokens, attachments(file_name)",
    )
    .eq("conversation_id", conversaId)
    .order("created_at")
    .order("id")
  falhou("carregar as mensagens", error)
  return ((data ?? []) as LinhaMensagem[]).map(paraRegistrada)
}

/** Grava uma mensagem do turno (append-only) e devolve o id. */
export async function gravarMensagem(
  supabase: Supabase,
  conversaId: string,
  m: MensagemRegistrada,
): Promise<string> {
  const linha = {
    conversation_id: conversaId,
    role: m.papel,
    content: m.conteudo as unknown as Json,
    tool_calls: m.papel === "tool" ? (m.cartoes as unknown as Json) : null,
    model: m.papel === "assistant" ? m.modelo : null,
    input_tokens: m.papel === "assistant" ? m.tokensEntrada : null,
    output_tokens: m.papel === "assistant" ? m.tokensSaida : null,
  }
  const { data, error } = await supabase.from("messages").insert(linha).select("id").single()
  falhou("gravar a mensagem", error)
  return data!.id
}

// Contexto dinâmico do turno -------------------------------------------------------------

const MODELO_AQUISICAO = { compra: "compra", permuta: "permuta" } as const
const TOLERANCIA = { baixa: "baixa", media: "média", alta: "alta" } as const

export function descreverPerfil(p: Tables<"investor_profiles"> | null): string {
  if (!p) return "não preenchido (sugira preencher em Perfil do investidor quando for útil)"
  const partes: string[] = []
  const ticket = [
    p.ticket_min !== null ? `de ${formatBRL(Number(p.ticket_min))}` : null,
    p.ticket_max !== null ? `até ${formatBRL(Number(p.ticket_max))}` : null,
  ].filter(Boolean)
  if (ticket.length) partes.push(`ticket ${ticket.join(" ")}`)
  if (p.typologies.length) {
    partes.push(
      `tipologias: ${p.typologies.map((t) => LAND_USE[t as keyof typeof LAND_USE]?.toLowerCase() ?? t).join(", ")}`,
    )
  }
  if (p.regions.length) partes.push(`regiões de interesse: ${p.regions.join(", ")}`)
  if (p.acquisition_models.length) {
    partes.push(
      `aquisição por ${p.acquisition_models.map((m) => MODELO_AQUISICAO[m]).join(" ou ")}`,
    )
  }
  if (p.min_margin !== null)
    partes.push(`margem mínima sobre o VGV: ${formatPercent(Number(p.min_margin))}`)
  if (p.risk_tolerance) partes.push(`tolerância a risco: ${TOLERANCIA[p.risk_tolerance]}`)
  if (p.horizon_months !== null) partes.push(`horizonte: ${p.horizon_months} meses`)
  return partes.length ? partes.join("; ") : "não preenchido"
}

export function montarContexto(c: {
  hoje: string
  nome: string | null
  perfil: Tables<"investor_profiles"> | null
  terrenoEmFoco: { codigo: string } | null
  ponto: { longitude: number; latitude: number } | null
  anexos: string[]
}): string {
  const linhas = [
    "Contexto desta mensagem (gerado pela plataforma; não foi escrito pelo usuário):",
    `- Data de hoje: ${formatDate(c.hoje)}.`,
    `- Usuário: ${c.nome?.trim() || "não informado"}.`,
    `- Perfil do investidor: ${descreverPerfil(c.perfil)}.`,
  ]
  if (c.terrenoEmFoco) linhas.push(`- Terreno aberto no painel lateral: ${c.terrenoEmFoco.codigo}.`)
  if (c.ponto) {
    linhas.push(
      `- Ponto selecionado no mapa: longitude ${c.ponto.longitude.toFixed(6)}, latitude ${c.ponto.latitude.toFixed(6)}.`,
    )
  }
  if (c.anexos.length) {
    linhas.push(
      `- Anexos desta mensagem (contexto do usuário, não fonte validada): ${c.anexos.join(", ")}.`,
    )
  }
  return linhas.join("\n")
}

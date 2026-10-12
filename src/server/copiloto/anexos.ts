import "server-only"

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages"

import { clienteAnthropic } from "@/lib/ai/config"
import type { Supabase } from "@/server/feasibility/carregar-contexto"

/**
 * Anexos do chat: o arquivo fica no Storage (bucket chat-attachments, pasta do
 * usuário) e é enviado uma vez à Files API da Anthropic; as mensagens citam o
 * file_id. Anexo é contexto do usuário, nunca fonte validada.
 */

export const BUCKET_ANEXOS = "chat-attachments"
export const TIPOS_ANEXO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export const TAMANHO_MAX_ANEXO = 20 * 1024 * 1024
export const MAX_ANEXOS_POR_MENSAGEM = 5

/** Prefixo do nome do arquivo na Files API: prova que fomos nós que subimos para este usuário. */
export function nomeNaFilesApi(userId: string, nome: string) {
  return `${userId}__${nome}`
}

export type AnexoPendente = {
  id: string
  file_name: string
  mime_type: string
  provider_file_id: string | null
}

/** Anexos ainda não ligados a mensagem, da conversa e do usuário (RLS). */
export async function carregarAnexosPendentes(
  supabase: Supabase,
  conversaId: string,
  ids: string[],
): Promise<AnexoPendente[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type, provider_file_id")
    .eq("conversation_id", conversaId)
    .is("message_id", null)
    .in("id", ids)
  if (error) throw new Error(`Falha ao carregar os anexos: ${error.message}`)
  return data ?? []
}

/**
 * Blocos da mensagem para os anexos. Confere na Files API que o arquivo foi
 * enviado por este servidor para este usuário (o file_id vale para a
 * organização inteira na Anthropic).
 */
export async function blocosDosAnexos(
  userId: string,
  anexos: AnexoPendente[],
): Promise<BetaContentBlockParam[]> {
  const blocos: BetaContentBlockParam[] = []
  for (const a of anexos) {
    if (!a.provider_file_id) continue
    const meta = await clienteAnthropic().files.retrieveMetadata(a.provider_file_id)
    if (!meta.filename.startsWith(nomeNaFilesApi(userId, ""))) continue
    if (a.mime_type === "application/pdf") {
      blocos.push({
        type: "document",
        source: { type: "file", file_id: a.provider_file_id },
        title: a.file_name,
      })
    } else {
      blocos.push({ type: "image", source: { type: "file", file_id: a.provider_file_id } })
    }
  }
  return blocos
}

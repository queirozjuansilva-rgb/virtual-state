"use server"

import { toFile } from "@anthropic-ai/sdk"
import { refresh } from "next/cache"
import { z } from "zod"

import { clienteAnthropic, temChaveAnthropic } from "@/lib/ai/config"
import { requireUser } from "@/lib/auth/dal"
import { createClient } from "@/lib/supabase/server"

import { BUCKET_ANEXOS, nomeNaFilesApi, TAMANHO_MAX_ANEXO, TIPOS_ANEXO } from "./anexos"
import { criarConversa, TITULO_PADRAO } from "./conversas"
import { carregarPainelTerreno, type PainelTerreno } from "./painel"

export type RespostaAnexo =
  | { ok: true; anexo: { id: string; nome: string }; conversaId: string }
  | { ok: false; erro: string }

/**
 * Sobe um anexo antes do envio da mensagem: Storage (pasta do usuário) + Files
 * API. Sem conversa ainda, cria uma ("Nova análise").
 */
export async function enviarAnexo(formData: FormData): Promise<RespostaAnexo> {
  const user = await requireUser()
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0)
    return { ok: false, erro: "Selecione um arquivo." }
  if (!(TIPOS_ANEXO as readonly string[]).includes(arquivo.type)) {
    return { ok: false, erro: "Envie PDF ou imagem (JPG, PNG ou WebP)." }
  }
  if (arquivo.size > TAMANHO_MAX_ANEXO) return { ok: false, erro: "O arquivo passa de 20 MB." }
  if (!temChaveAnthropic()) return { ok: false, erro: "O copiloto ainda não está configurado." }

  const supabase = await createClient()
  const conversaInformada = z.uuid().safeParse(formData.get("conversaId"))
  const conversaId = conversaInformada.success
    ? conversaInformada.data
    : (await criarConversa(supabase, TITULO_PADRAO)).id

  const id = crypto.randomUUID()
  const nome = arquivo.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "anexo"
  const caminho = `${user.id}/${conversaId}/${id}-${nome}`
  const bytes = Buffer.from(await arquivo.arrayBuffer())

  const upload = await supabase.storage
    .from(BUCKET_ANEXOS)
    .upload(caminho, bytes, { contentType: arquivo.type, upsert: false })
  if (upload.error) {
    console.error(upload.error)
    return { ok: false, erro: "Não foi possível guardar o arquivo." }
  }

  let providerFileId: string
  try {
    const meta = await clienteAnthropic().files.upload({
      file: await toFile(bytes, nomeNaFilesApi(user.id, nome), { type: arquivo.type }),
    })
    providerFileId = meta.id
  } catch (error) {
    console.error(error)
    await supabase.storage.from(BUCKET_ANEXOS).remove([caminho])
    return { ok: false, erro: "Não foi possível preparar o arquivo para o copiloto." }
  }

  const { error } = await supabase.from("attachments").insert({
    id,
    conversation_id: conversaId,
    storage_path: caminho,
    file_name: nome,
    mime_type: arquivo.type,
    size_bytes: arquivo.size,
    provider_file_id: providerFileId,
  })
  if (error) {
    console.error(error)
    return { ok: false, erro: "Não foi possível registrar o anexo." }
  }
  return { ok: true, anexo: { id, nome }, conversaId }
}

/** Remove um anexo ainda não enviado. */
export async function removerAnexo(id: string): Promise<void> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return
  const supabase = await createClient()
  const { data } = await supabase
    .from("attachments")
    .select("storage_path, provider_file_id")
    .eq("id", id)
    .is("message_id", null)
    .maybeSingle()
  if (!data) return
  await supabase.from("attachments").delete().eq("id", id)
  await supabase.storage.from(BUCKET_ANEXOS).remove([data.storage_path])
  if (data.provider_file_id) {
    await clienteAnthropic()
      .files.delete(data.provider_file_id)
      .catch((error: unknown) => console.error(error))
  }
}

const tituloSchema = z
  .string()
  .trim()
  .min(1, "Informe um título.")
  .max(120, "Use até 120 caracteres.")

export async function renomearConversa(
  id: string,
  titulo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await requireUser()
  const parsed = tituloSchema.safeParse(titulo)
  if (!parsed.success || !z.uuid().safeParse(id).success) {
    return { ok: false, erro: parsed.error?.issues[0]?.message ?? "Conversa inválida." }
  }
  const supabase = await createClient()
  const { error } = await supabase.from("conversations").update({ title: parsed.data }).eq("id", id)
  if (error) return { ok: false, erro: "Não foi possível renomear." }
  refresh()
  return { ok: true }
}

/** Exclui a conversa, as mensagens (cascade) e os arquivos dos anexos. */
export async function excluirConversa(id: string): Promise<{ ok: boolean }> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { ok: false }
  const supabase = await createClient()
  const { data: anexos } = await supabase
    .from("attachments")
    .select("storage_path, provider_file_id")
    .eq("conversation_id", id)
  const { error } = await supabase.from("conversations").delete().eq("id", id)
  if (error) return { ok: false }
  if (anexos?.length) {
    await supabase.storage.from(BUCKET_ANEXOS).remove(anexos.map((a) => a.storage_path))
    if (temChaveAnthropic()) {
      await Promise.all(
        anexos.flatMap((a) =>
          a.provider_file_id
            ? [
                clienteAnthropic()
                  .files.delete(a.provider_file_id)
                  .catch((e: unknown) => console.error(e)),
              ]
            : [],
        ),
      )
    }
  }
  refresh()
  return { ok: true }
}

/** Dados do painel "Contexto do lote" para o terreno em foco na conversa. */
export async function obterPainelTerreno(landId: string): Promise<PainelTerreno | null> {
  await requireUser()
  if (!z.uuid().safeParse(landId).success) return null
  return carregarPainelTerreno(await createClient(), landId)
}

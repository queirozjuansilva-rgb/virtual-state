import Anthropic from "@anthropic-ai/sdk"
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { z } from "zod"

import { temChaveAnthropic } from "@/lib/ai/config"
import { montarHistorico, type MensagemRegistrada } from "@/lib/ai/conteudo"
import { executarTurno } from "@/lib/ai/copiloto"
import type { EventoChat } from "@/lib/ai/tipos"
import { createClient } from "@/lib/supabase/server"
import {
  blocosDosAnexos,
  carregarAnexosPendentes,
  MAX_ANEXOS_POR_MENSAGEM,
} from "@/server/copiloto/anexos"
import {
  carregarMensagens,
  criarConversa,
  gravarMensagem,
  montarContexto,
  obterConversa,
  tituloDaPergunta,
  TITULO_PADRAO,
} from "@/server/copiloto/conversas"
import { dadosSupabase } from "@/server/copiloto/dados-supabase"

/** Turnos com várias ferramentas e estudos podem levar alguns minutos. */
export const maxDuration = 300

const pedidoSchema = z.object({
  conversaId: z.uuid().nullish(),
  texto: z.string().trim().min(1).max(8000),
  anexos: z.array(z.uuid()).max(MAX_ANEXOS_POR_MENSAGEM).default([]),
  ponto: z
    .object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })
    .nullish(),
})

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status })
}

function mensagemDeErro(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "O copiloto está com muitas solicitações agora. Tente de novo em instantes."
  }
  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return "O serviço de IA está instável no momento. Tente de novo em instantes."
  }
  return "Não foi possível concluir a resposta. Tente de novo."
}

/**
 * Chat do copiloto: recebe a pergunta e devolve NDJSON (um EventoChat por
 * linha) enquanto o modelo responde e as ferramentas rodam. Tudo com o
 * cliente do usuário: a RLS decide o que ele vê e grava.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) return erro(401, "Sua sessão expirou. Entre de novo.")
  if (!temChaveAnthropic()) {
    return erro(
      503,
      "O copiloto ainda não está configurado neste ambiente (chave da Anthropic ausente).",
    )
  }

  const parsed = pedidoSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return erro(400, "Mensagem inválida.")
  const pedido = parsed.data

  let conversa = pedido.conversaId ? await obterConversa(supabase, pedido.conversaId) : null
  if (pedido.conversaId && !conversa) return erro(404, "Conversa não encontrada.")
  const novaConversa = !conversa
  conversa ??= await criarConversa(supabase, tituloDaPergunta(pedido.texto))

  const [registradas, perfil, profile, anexos, foco] = await Promise.all([
    novaConversa ? Promise.resolve([]) : carregarMensagens(supabase, conversa.id),
    supabase.from("investor_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    carregarAnexosPendentes(supabase, conversa.id, pedido.anexos),
    conversa.land_id
      ? supabase.from("lands").select("code").eq("id", conversa.land_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Conversa criada por um anexo ainda tem o título padrão: usa a pergunta.
  if (conversa.title === TITULO_PADRAO && registradas.length === 0) {
    const titulo = tituloDaPergunta(pedido.texto)
    await supabase.from("conversations").update({ title: titulo }).eq("id", conversa.id)
    conversa = { ...conversa, title: titulo }
  }

  const dados = dadosSupabase(supabase, conversa.id)
  const pergunta: BetaContentBlockParam[] = [
    { type: "text", text: pedido.texto },
    ...(await blocosDosAnexos(userId, anexos)),
  ]
  const contexto = montarContexto({
    hoje: dados.hoje(),
    nome: profile.data?.full_name ?? null,
    perfil: perfil.data ?? null,
    terrenoEmFoco: foco.data ? { codigo: foco.data.code } : null,
    ponto: pedido.ponto ?? null,
    anexos: anexos.map((a) => a.file_name),
  })

  const conversaId = conversa.id
  const titulo = conversa.title
  const codificador = new TextEncoder()
  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      let aberto = true
      const emitir = (evento: EventoChat) => {
        if (!aberto) return
        try {
          controller.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`))
        } catch {
          aberto = false
        }
      }
      emitir({ t: "conversa", id: conversaId, titulo })

      let terrenoEmFoco: string | null = null
      try {
        await executarTurno({
          historico: montarHistorico(registradas as MensagemRegistrada[]),
          pergunta,
          contexto,
          ferramentas: { dados },
          signal: request.signal,
          emitir(evento) {
            if (evento.t === "foco") terrenoEmFoco = evento.terrenoId
            emitir(evento)
          },
          async registrar(m) {
            const id = await gravarMensagem(supabase, conversaId, m)
            if (m.papel === "user" && anexos.length > 0) {
              await supabase
                .from("attachments")
                .update({ message_id: id })
                .in(
                  "id",
                  anexos.map((a) => a.id),
                )
            }
          },
        })
        emitir({ t: "fim" })
      } catch (error) {
        if (!(error instanceof Anthropic.APIUserAbortError)) {
          console.error("Falha no turno do copiloto:", error)
          emitir({ t: "erro", mensagem: mensagemDeErro(error) })
        }
      } finally {
        await supabase
          .from("conversations")
          .update({
            updated_at: new Date().toISOString(),
            ...(terrenoEmFoco ? { land_id: terrenoEmFoco } : {}),
          })
          .eq("id", conversaId)
        if (aberto) {
          try {
            controller.close()
          } catch {
            // O navegador já fechou a conexão.
          }
        }
      }
    },
  })

  return new Response(corpo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}

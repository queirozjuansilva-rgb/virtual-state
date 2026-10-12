import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"

import { BETAS_COPILOTO, clienteAnthropic, configCopiloto, MAX_PASSOS_POR_TURNO } from "./config"
import type { CartaoRegistrado, MensagemRegistrada } from "./conteudo"
import { textoDoAssistente } from "./conteudo"
import { promptCopiloto } from "./prompts"
import type { EventoChat } from "./tipos"
import {
  definicoesFerramentas,
  executarFerramenta,
  rotuloFerramenta,
  type ContextoFerramenta,
} from "./tools"

/**
 * Loop do copiloto (ADR 0009): uma pergunta do usuário → N chamadas ao modelo
 * com ferramentas, até a resposta final. Histórico append-only; o system
 * prompt e as ferramentas ficam congelados; o contexto dinâmico (data, perfil,
 * ponto no mapa) entra como mensagem de sistema depois da pergunta.
 */

export const MENSAGEM_RECUSA =
  "Não posso ajudar com esse pedido. Posso seguir com análises de terrenos, zoneamento, mercado e viabilidade."

const AVISO_LIMITE_PASSOS =
  "Limite de consultas deste turno atingido. Responda agora ao usuário com o que já foi apurado, sem chamar ferramentas, e diga o que ficou pendente."

const MAX_REPETICOES_JSON = 2

export type ChamadaFerramenta = {
  nome: string
  entrada: unknown
  ok: boolean
  resultado: unknown
}

export type ResultadoTurno = {
  /** Texto final exibido ao usuário (todas as mensagens do turno). */
  texto: string
  chamadas: ChamadaFerramenta[]
  recusado: boolean
  tokensEntrada: number
  tokensSaida: number
}

export type OpcoesTurno = {
  historico: BetaMessageParam[]
  pergunta: BetaContentBlockParam[]
  /** Contexto dinâmico do turno (mensagem de sistema); null se não houver. */
  contexto: string | null
  ferramentas: ContextoFerramenta
  emitir(evento: EventoChat): void
  registrar(mensagem: MensagemRegistrada): Promise<void>
  signal?: AbortSignal
  /** Injeções para os evals. */
  cliente?: Anthropic
  modelo?: string
}

function totalEntrada(m: BetaMessage): number {
  const u = m.usage
  return u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
}

export async function executarTurno(o: OpcoesTurno): Promise<ResultadoTurno> {
  const cliente = o.cliente ?? clienteAnthropic()
  const modelo = o.modelo ?? configCopiloto.ANTHROPIC_MODEL
  const ferramentas = definicoesFerramentas()
  const mensagens: BetaMessageParam[] = [...o.historico]

  async function anexar(m: MensagemRegistrada, api: BetaMessageParam) {
    mensagens.push(api)
    await o.registrar(m)
  }

  await anexar({ papel: "user", conteudo: o.pergunta }, { role: "user", content: o.pergunta })
  if (o.contexto) {
    await anexar({ papel: "system", conteudo: o.contexto }, { role: "system", content: o.contexto })
  }

  const resultado: ResultadoTurno = {
    texto: "",
    chamadas: [],
    recusado: false,
    tokensEntrada: 0,
    tokensSaida: 0,
  }

  async function chamarModelo(semFerramentas: boolean): Promise<BetaMessage> {
    for (let tentativa = 0; ; tentativa++) {
      o.emitir({ t: "passo" })
      const stream = cliente.beta.messages.stream(
        {
          model: modelo,
          max_tokens: configCopiloto.COPILOTO_MAX_TOKENS,
          system: [{ type: "text", text: promptCopiloto(), cache_control: { type: "ephemeral" } }],
          tools: ferramentas,
          tool_choice: semFerramentas ? { type: "none" } : { type: "auto" },
          messages: mensagens,
          thinking: {
            type: "adaptive",
            display: "updates",
            block_binding: { prefix_mismatch_behavior: "drop_block" },
          },
          output_config: { effort: configCopiloto.COPILOTO_EFFORT },
          cache_control: { type: "ephemeral" },
          fallbacks: "default",
          betas: BETAS_COPILOTO,
        },
        { signal: o.signal },
      )

      const notas = new Map<number, string>()
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_start") {
            const bloco = ev.content_block
            if (bloco.type === "fallback") o.emitir({ t: "descartar" })
            else if (bloco.type === "thinking") notas.set(ev.index, "")
            else if (bloco.type === "tool_use") {
              o.emitir({
                t: "ferramenta",
                id: bloco.id,
                nome: bloco.name,
                rotulo: rotuloFerramenta(bloco.name),
                estado: "inicio",
              })
            }
          } else if (ev.type === "content_block_delta") {
            if (ev.delta.type === "text_delta") o.emitir({ t: "texto", delta: ev.delta.text })
            else if (ev.delta.type === "thinking_delta" && notas.has(ev.index)) {
              notas.set(ev.index, notas.get(ev.index) + ev.delta.thinking)
            }
          } else if (ev.type === "content_block_stop") {
            // Com display "updates", todo bloco de thinking com texto é nota de progresso.
            const nota = notas.get(ev.index)?.trim()
            if (nota) o.emitir({ t: "progresso", texto: nota })
            notas.delete(ev.index)
          }
        }
        return await stream.finalMessage()
      } catch (error) {
        // Entrada de ferramenta em JSON impossível de ler (streaming antecipado):
        // repete o passo. Erros da API sobem.
        if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIUserAbortError) {
          throw error
        }
        if (tentativa >= MAX_REPETICOES_JSON) {
          throw new Error("Entrada de ferramenta ilegível após repetir o passo.", { cause: error })
        }
        o.emitir({ t: "descartar" })
      }
    }
  }

  for (let passo = 0; passo <= MAX_PASSOS_POR_TURNO; passo++) {
    const ultimo = passo === MAX_PASSOS_POR_TURNO
    if (ultimo) {
      await anexar(
        { papel: "system", conteudo: AVISO_LIMITE_PASSOS },
        { role: "system", content: AVISO_LIMITE_PASSOS },
      )
    }
    const msg = await chamarModelo(ultimo)
    resultado.tokensEntrada += totalEntrada(msg)
    resultado.tokensSaida += msg.usage.output_tokens

    // Recusa antes de qualquer saída devolve conteúdo vazio, que a API não
    // aceita de volta como turno do assistente: grava o aviso no lugar.
    const conteudo =
      msg.content.length > 0
        ? msg.content
        : [{ type: "text" as const, text: MENSAGEM_RECUSA, citations: null }]
    await anexar(
      {
        papel: "assistant",
        conteudo,
        modelo: msg.model,
        tokensEntrada: totalEntrada(msg),
        tokensSaida: msg.usage.output_tokens,
      },
      { role: "assistant", content: conteudo },
    )

    if (msg.stop_reason === "refusal") {
      resultado.recusado = true
      o.emitir({ t: "recusa", mensagem: MENSAGEM_RECUSA })
      // As chamadas de ferramenta de um turno recusado nunca rodam.
      await responderChamadas(msg, "Turno recusado; a ferramenta não foi executada.")
      break
    }
    resultado.texto += textoDoAssistente(msg.content)

    if (msg.stop_reason === "pause_turn") continue
    const chamadas = msg.content.filter((b) => b.type === "tool_use")
    if (chamadas.length === 0) break

    if (msg.stop_reason === "max_tokens") {
      // Entrada truncada pode passar na validação: não executa.
      await responderChamadas(
        msg,
        "Entrada da ferramenta truncada pelo limite de tokens. Refaça a chamada.",
      )
      continue
    }

    const resultados: BetaToolResultBlockParam[] = []
    const cartoes: CartaoRegistrado[] = []
    for (const chamada of chamadas) {
      const execucao = await executarFerramenta(chamada.name, chamada.input, o.ferramentas)
      const rotulo = rotuloFerramenta(chamada.name)
      if (execucao.ok) {
        const { saida } = execucao
        resultados.push({
          type: "tool_result",
          tool_use_id: chamada.id,
          content: JSON.stringify(saida.resultado),
        })
        cartoes.push({
          toolUseId: chamada.id,
          nome: chamada.name,
          cartao: saida.cartao,
          terrenoId: saida.terrenoId,
        })
        o.emitir({ t: "ferramenta", id: chamada.id, nome: chamada.name, rotulo, estado: "fim" })
        if (saida.cartao) o.emitir({ t: "cartao", cartao: saida.cartao })
        if (saida.terrenoId) o.emitir({ t: "foco", terrenoId: saida.terrenoId })
        resultado.chamadas.push({
          nome: chamada.name,
          entrada: chamada.input,
          ok: true,
          resultado: saida.resultado,
        })
      } else {
        resultados.push({
          type: "tool_result",
          tool_use_id: chamada.id,
          is_error: true,
          content: execucao.erro,
        })
        cartoes.push({ toolUseId: chamada.id, nome: chamada.name, erro: execucao.erro })
        o.emitir({ t: "ferramenta", id: chamada.id, nome: chamada.name, rotulo, estado: "erro" })
        resultado.chamadas.push({
          nome: chamada.name,
          entrada: chamada.input,
          ok: false,
          resultado: execucao.erro,
        })
      }
    }
    await anexar(
      { papel: "tool", conteudo: resultados, cartoes },
      { role: "user", content: resultados },
    )
  }

  return resultado

  async function responderChamadas(msg: BetaMessage, motivo: string) {
    const chamadas = msg.content.filter((b) => b.type === "tool_use")
    if (chamadas.length === 0) return
    const resultados: BetaToolResultBlockParam[] = chamadas.map((c) => ({
      type: "tool_result",
      tool_use_id: c.id,
      is_error: true,
      content: motivo,
    }))
    for (const c of chamadas) {
      o.emitir({
        t: "ferramenta",
        id: c.id,
        nome: c.name,
        rotulo: rotuloFerramenta(c.name),
        estado: "erro",
      })
    }
    await anexar(
      {
        papel: "tool",
        conteudo: resultados,
        cartoes: chamadas.map((c) => ({ toolUseId: c.id, nome: c.name, erro: motivo })),
      },
      { role: "user", content: resultados },
    )
  }
}

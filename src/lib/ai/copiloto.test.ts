import type Anthropic from "@anthropic-ai/sdk"
import type {
  BetaContentBlock,
  BetaMessage,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { describe, expect, it } from "vitest"

import { MAX_PASSOS_POR_TURNO } from "./config"
import type { MensagemRegistrada } from "./conteudo"
import { executarTurno, MENSAGEM_RECUSA } from "./copiloto"
import { criarDadosFixture } from "./evals/fixture/dados-fixture"
import type { EventoChat } from "./tipos"

type Resposta = { content: BetaContentBlock[]; stop_reason: BetaMessage["stop_reason"] }

/** Cliente falso: devolve as respostas roteirizadas como stream de eventos. */
function clienteFalso(respostas: Resposta[] | ((n: number) => Resposta)) {
  const pedidos: Record<string, unknown>[] = []
  const cliente = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          pedidos.push(structuredClone(params))
          const n = pedidos.length - 1
          const r = typeof respostas === "function" ? respostas(n) : respostas[n]
          const mensagem = {
            id: `msg_${n}`,
            type: "message",
            role: "assistant",
            model: "claude-sonnet-5-5",
            content: r.content,
            stop_reason: r.stop_reason,
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50 },
          } as unknown as BetaMessage
          const eventos: BetaRawMessageStreamEvent[] = []
          r.content.forEach((bloco, index) => {
            const inicio =
              bloco.type === "text"
                ? { ...bloco, text: "" }
                : bloco.type === "thinking"
                  ? { ...bloco, thinking: "" }
                  : bloco
            eventos.push({
              type: "content_block_start",
              index,
              content_block: inicio,
            } as BetaRawMessageStreamEvent)
            if (bloco.type === "text") {
              for (const pedaco of bloco.text.match(/[\s\S]{1,8}/g) ?? []) {
                eventos.push({
                  type: "content_block_delta",
                  index,
                  delta: { type: "text_delta", text: pedaco },
                } as BetaRawMessageStreamEvent)
              }
            } else if (bloco.type === "thinking" && bloco.thinking) {
              eventos.push({
                type: "content_block_delta",
                index,
                delta: { type: "thinking_delta", thinking: bloco.thinking },
              } as BetaRawMessageStreamEvent)
            }
            eventos.push({ type: "content_block_stop", index } as BetaRawMessageStreamEvent)
          })
          return {
            async *[Symbol.asyncIterator]() {
              yield* eventos
            },
            finalMessage: async () => mensagem,
          }
        },
      },
    },
  }
  return { cliente: cliente as unknown as Anthropic, pedidos }
}

const texto = (t: string) => ({ type: "text", text: t, citations: null }) as BetaContentBlock
const nota = (t: string) =>
  ({ type: "thinking", thinking: t, signature: "sig" }) as BetaContentBlock
const ferramenta = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as BetaContentBlock

async function turno(
  respostas: Resposta[] | ((n: number) => Resposta),
  pergunta = "qual o recuo frontal do VE-0001?",
) {
  const { cliente, pedidos } = clienteFalso(respostas)
  const eventos: EventoChat[] = []
  const gravadas: MensagemRegistrada[] = []
  const resultado = await executarTurno({
    historico: [],
    pergunta: [{ type: "text", text: pergunta }],
    contexto: "Contexto desta mensagem: data de hoje 12/10/2026.",
    ferramentas: { dados: criarDadosFixture() },
    emitir: (e) => eventos.push(e),
    registrar: async (m) => {
      gravadas.push(m)
    },
    cliente,
    modelo: "claude-sonnet-5-5",
  })
  return { resultado, eventos, gravadas, pedidos }
}

describe("executarTurno", () => {
  it("roda a ferramenta, emite cartão e foco, e grava o turno append-only", async () => {
    const { resultado, eventos, gravadas, pedidos } = await turno([
      {
        content: [
          nota("Vou consultar os parâmetros validados do VE-0001."),
          ferramenta("toolu_1", "consultar_parametros_urbanisticos", {
            terreno: "VE-0001",
            uso: "residencial_vertical",
          }),
        ],
        stop_reason: "tool_use",
      },
      {
        content: [nota(""), texto("O recuo frontal do VE-0001 é **5 m**.")],
        stop_reason: "end_turn",
      },
    ])

    expect(resultado.texto).toBe("O recuo frontal do VE-0001 é **5 m**.")
    expect(resultado.chamadas).toMatchObject([
      { nome: "consultar_parametros_urbanisticos", ok: true },
    ])
    expect(resultado.tokensEntrada).toBe(300)

    const tipos = eventos.map((e) => e.t)
    expect(tipos).toEqual([
      "passo",
      "progresso",
      "ferramenta",
      "ferramenta",
      "cartao",
      "foco",
      "passo",
      ...Array(5).fill("texto"),
    ])
    expect(eventos.find((e) => e.t === "progresso")).toMatchObject({
      texto: "Vou consultar os parâmetros validados do VE-0001.",
    })

    expect(gravadas.map((m) => m.papel)).toEqual([
      "user",
      "system",
      "assistant",
      "tool",
      "assistant",
    ])
    const tool = gravadas[3] as Extract<MensagemRegistrada, { papel: "tool" }>
    expect(tool.conteudo[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" })
    expect(tool.cartoes[0].cartao?.tipo).toBe("parametros")

    // Segundo pedido = primeiro + respostas, sem editar nada (cache e thinking preservados).
    const [p1, p2] = pedidos as { messages: unknown[] }[]
    expect(p2.messages.slice(0, p1.messages.length)).toEqual(p1.messages)
    expect(p1.messages).toMatchObject([{ role: "user" }, { role: "system" }])
  })

  it("configura o pedido: prompt em cache, ferramentas, thinking com notas, fallback e betas", async () => {
    const { pedidos } = await turno([{ content: [texto("Olá.")], stop_reason: "end_turn" }], "oi")
    const p = pedidos[0] as Record<string, never>
    expect(p.model).toBe("claude-sonnet-5-5")
    expect(p.system).toMatchObject([{ type: "text", cache_control: { type: "ephemeral" } }])
    expect((p.system as { text: string }[])[0].text).toMatch(/copiloto da virtual\.estate/)
    expect((p.tools as unknown[]).length).toBe(10)
    expect(p.thinking).toEqual({
      type: "adaptive",
      display: "updates",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    })
    expect(p.fallbacks).toBe("default")
    expect(p.cache_control).toEqual({ type: "ephemeral" })
    expect(p.betas).toEqual([
      "server-side-fallback-2026-07-01",
      "thinking-display-updates-2026-08-18",
      "thinking-binding-controls-2026-08-01",
    ])
    expect(p.tool_choice).toEqual({ type: "auto" })
  })

  it("erro da ferramenta volta ao modelo como is_error", async () => {
    const { gravadas, eventos } = await turno([
      {
        content: [ferramenta("toolu_1", "obter_terreno", { terreno: "VE-9999" })],
        stop_reason: "tool_use",
      },
      { content: [texto("Não encontrei esse terreno.")], stop_reason: "end_turn" },
    ])
    const tool = gravadas.find((m) => m.papel === "tool") as Extract<
      MensagemRegistrada,
      { papel: "tool" }
    >
    expect(tool.conteudo[0]).toMatchObject({
      is_error: true,
      content: expect.stringMatching(/não encontrado/),
    })
    expect(eventos).toContainEqual(expect.objectContaining({ t: "ferramenta", estado: "erro" }))
  })

  it("recusa antes de qualquer saída grava o aviso e não roda ferramentas", async () => {
    const { resultado, eventos, gravadas, pedidos } = await turno([
      { content: [], stop_reason: "refusal" },
    ])
    expect(resultado.recusado).toBe(true)
    expect(eventos).toContainEqual({ t: "recusa", mensagem: MENSAGEM_RECUSA })
    const assistente = gravadas.find((m) => m.papel === "assistant") as Extract<
      MensagemRegistrada,
      { papel: "assistant" }
    >
    expect(assistente.conteudo).toEqual([{ type: "text", text: MENSAGEM_RECUSA, citations: null }])
    expect(pedidos).toHaveLength(1)
  })

  it("recusa com ferramenta pendente responde a chamada com erro (histórico válido)", async () => {
    const { gravadas } = await turno([
      {
        content: [ferramenta("toolu_1", "obter_terreno", { terreno: "VE-00" })],
        stop_reason: "refusal",
      },
    ])
    expect(gravadas.map((m) => m.papel)).toEqual(["user", "system", "assistant", "tool"])
  })

  it("entrada truncada por max_tokens não é executada", async () => {
    const { resultado, gravadas } = await turno([
      {
        content: [ferramenta("toolu_1", "obter_terreno", { terreno: "VE-0001" })],
        stop_reason: "max_tokens",
      },
      { content: [texto("Pronto.")], stop_reason: "end_turn" },
    ])
    expect(resultado.chamadas).toEqual([])
    const tool = gravadas.find((m) => m.papel === "tool") as Extract<
      MensagemRegistrada,
      { papel: "tool" }
    >
    expect(tool.conteudo[0]).toMatchObject({
      is_error: true,
      content: expect.stringMatching(/truncada/),
    })
  })

  it("limite de passos: último pedido sem ferramentas e com aviso de sistema", async () => {
    const { pedidos, gravadas } = await turno((n) =>
      n < MAX_PASSOS_POR_TURNO
        ? {
            content: [ferramenta(`toolu_${n}`, "obter_terreno", { terreno: "VE-0001" })],
            stop_reason: "tool_use",
          }
        : { content: [texto("Resumo do que apurei.")], stop_reason: "end_turn" },
    )
    expect(pedidos).toHaveLength(MAX_PASSOS_POR_TURNO + 1)
    expect((pedidos.at(-1) as { tool_choice: unknown }).tool_choice).toEqual({ type: "none" })
    expect(gravadas.filter((m) => m.papel === "system")).toHaveLength(2)
  })
})

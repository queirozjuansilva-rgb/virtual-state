import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { describe, expect, it } from "vitest"

import {
  itensDaConversa,
  montarHistorico,
  textoDoAssistente,
  type MensagemRegistrada,
} from "./conteudo"

const assistente = (conteudo: unknown[]): MensagemRegistrada => ({
  papel: "assistant",
  conteudo: conteudo as BetaContentBlock[],
  modelo: "claude-sonnet-5-5",
  tokensEntrada: 1,
  tokensSaida: 1,
})

describe("montarHistorico", () => {
  it("mapeia papéis para a API (resultado de ferramenta é turno do usuário)", () => {
    const h = montarHistorico([
      { papel: "user", conteudo: [{ type: "text", text: "oi" }] },
      { papel: "system", conteudo: "contexto" },
      assistente([{ type: "tool_use", id: "t1", name: "obter_terreno", input: {} }]),
      {
        papel: "tool",
        conteudo: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }],
        cartoes: [],
      },
    ])
    expect(h.map((m) => m.role)).toEqual(["user", "system", "assistant", "user"])
  })

  it("completa chamadas interrompidas com resultado de erro determinístico", () => {
    const mensagens: MensagemRegistrada[] = [
      { papel: "user", conteudo: [{ type: "text", text: "oi" }] },
      assistente([{ type: "tool_use", id: "t1", name: "obter_terreno", input: {} }]),
      { papel: "user", conteudo: [{ type: "text", text: "e aí?" }] },
    ]
    const h = montarHistorico(mensagens)
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user", "user"])
    expect(h[2].content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "t1", is_error: true }),
    ])
    expect(montarHistorico(mensagens)).toEqual(h)
  })
})

describe("exibição", () => {
  const comFallback = [
    { type: "text", text: "parcial descartado" },
    { type: "fallback", from: {}, to: {}, trigger: {} },
    { type: "thinking", thinking: "", signature: "s" },
    { type: "thinking", thinking: "Consultando o mercado.", signature: "s" },
    { type: "text", text: "Resposta final." },
  ] as unknown as BetaContentBlock[]

  it("mostra só o que vem depois do último fallback", () => {
    expect(textoDoAssistente(comFallback)).toBe("Resposta final.")
  })

  it("converte mensagens gravadas em itens da conversa", () => {
    const itens = itensDaConversa([
      {
        id: "m1",
        papel: "user",
        conteudo: [{ type: "text", text: "pergunta" }],
        anexos: ["planta.pdf"],
      },
      { id: "m2", papel: "system", conteudo: "contexto" },
      { id: "m3", ...assistente(comFallback) },
      {
        id: "m4",
        papel: "tool",
        conteudo: [],
        cartoes: [
          { toolUseId: "t1", nome: "obter_terreno", erro: "falhou" },
          {
            toolUseId: "t2",
            nome: "solicitar_cobertura",
            cartao: {
              tipo: "cobertura",
              dados: { protocolo: "AB12", municipio: "Petrolina", uf: "PE", mensagem: "ok" },
            },
          },
        ],
      },
    ])
    expect(itens).toEqual([
      { tipo: "usuario", id: "m1", texto: "pergunta", anexos: ["planta.pdf"] },
      { tipo: "progresso", id: "m3:1", texto: "Consultando o mercado." },
      { tipo: "assistente", id: "m3:2", texto: "Resposta final." },
      expect.objectContaining({ tipo: "cartao", id: "m4:t2" }),
    ])
  })
})

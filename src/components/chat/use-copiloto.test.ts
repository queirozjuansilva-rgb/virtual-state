import { describe, expect, it } from "vitest"

import type { EventoChat } from "@/lib/ai/tipos"

import { aplicarEvento, type ItemTela } from "./use-copiloto"

function aplicar(eventos: EventoChat[], inicial: ItemTela[] = []) {
  let estado = { itens: inicial, inicioPasso: Number.MAX_SAFE_INTEGER }
  for (const e of eventos) estado = aplicarEvento(estado.itens, e, estado.inicioPasso)
  return estado.itens
}

const pergunta: ItemTela = { tipo: "usuario", id: "u1", texto: "oi", anexos: [] }

describe("aplicarEvento", () => {
  it("junta os pedaços de texto do mesmo passo e separa passos", () => {
    const itens = aplicar(
      [
        { t: "passo" },
        { t: "texto", delta: "Vou " },
        { t: "texto", delta: "consultar." },
        { t: "ferramenta", id: "t1", nome: "obter_terreno", rotulo: "Abrindo", estado: "inicio" },
        { t: "ferramenta", id: "t1", nome: "obter_terreno", rotulo: "Abrindo", estado: "fim" },
        { t: "passo" },
        { t: "texto", delta: "Pronto." },
      ],
      [pergunta],
    )
    expect(itens.map((i) => i.tipo)).toEqual(["usuario", "assistente", "ferramenta", "assistente"])
    expect(itens[1]).toMatchObject({ texto: "Vou consultar." })
    expect(itens[2]).toMatchObject({ estado: "fim" })
    expect(itens[3]).toMatchObject({ texto: "Pronto." })
  })

  it("descarta o texto parcial do passo no fallback e na recusa", () => {
    const fallback = aplicar(
      [
        { t: "passo" },
        { t: "texto", delta: "parcial" },
        { t: "descartar" },
        { t: "texto", delta: "novo" },
      ],
      [pergunta],
    )
    expect(fallback.map((i) => (i.tipo === "assistente" ? i.texto : i.tipo))).toEqual([
      "usuario",
      "novo",
    ])

    const recusa = aplicar(
      [{ t: "passo" }, { t: "texto", delta: "parcial" }, { t: "recusa", mensagem: "Não posso." }],
      [pergunta],
    )
    expect(recusa.map((i) => (i.tipo === "assistente" ? i.texto : i.tipo))).toEqual([
      "usuario",
      "Não posso.",
    ])
  })

  it("acrescenta progresso, cartão e erro", () => {
    const itens = aplicar([
      { t: "progresso", texto: "Buscando." },
      {
        t: "cartao",
        cartao: {
          tipo: "cobertura",
          dados: { protocolo: "A", municipio: "X", uf: "CE", mensagem: "ok" },
        },
      },
      { t: "erro", mensagem: "Falhou." },
      { t: "fim" },
    ])
    expect(itens.map((i) => i.tipo)).toEqual(["progresso", "cartao", "erro"])
  })
})

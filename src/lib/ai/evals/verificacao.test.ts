import { describe, expect, it } from "vitest"

import { extrairNumeros, numerosDeJson, numerosSemOrigem } from "./verificacao"

describe("extrairNumeros", () => {
  it("lê formatos pt-BR com moeda, sufixo e unidade", () => {
    const n = extrairNumeros(
      "R$ 4,2 milhões, 12.961,24/m², margem de 18,5%, recuo de 5 m e 2 zonas",
    )
    expect(n.map((x) => [x.valor, x.relevante])).toEqual([
      [4_200_000, true],
      [12_961.24, true],
      [18.5, true],
      [5, true],
      [2, false],
    ])
  })

  it("ignora números dentro de códigos", () => {
    expect(extrairNumeros("VE-0001 na ZT-2, CUB R8-N").map((x) => x.valor)).toEqual([])
  })
})

describe("numerosSemOrigem", () => {
  const ferramenta = {
    preco_fmt: "R$ 4.200.000,00",
    to_max: 0.6,
    margem_fmt: "29%",
    mediana_m2_fmt: "R$ 12.961,24/m²",
  }

  it("aceita números das ferramentas, inclusive arredondados e frações como %", () => {
    expect(
      numerosSemOrigem(
        "Preço de R$ 4,2 milhões, TO de 60%, margem de 29% e mediana de R$ 12,96 mil/m².",
        [ferramenta],
      ),
    ).toEqual([])
  })

  it("aponta números inventados ou calculados", () => {
    expect(
      numerosSemOrigem("O lucro seria de R$ 7,5 milhões e a margem 33%.", [ferramenta]),
    ).toEqual(["R$ 7,5 milhões", "33%"])
  })

  it("aceita números da pergunta", () => {
    expect(
      numerosSemOrigem("Até R$ 3 milhões, como você pediu.", ["tenho até R$ 3.000.000"]),
    ).toEqual([])
  })

  it("coleta números crus e formatados de JSON", () => {
    expect(numerosDeJson({ a: 1, b: ["2,5 m", { c: "R$ 10.000,00" }] })).toEqual([1, 2.5, 10000])
  })
})

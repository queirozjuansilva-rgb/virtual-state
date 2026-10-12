import { describe, expect, it } from "vitest"

import { formatarFonte, formatarValorPremissa } from "./fonte"

const nbsp = (s: string) => s.replace(/ /g, " ")

describe("formatarFonte", () => {
  it("formata cada tipo de fonte", () => {
    expect(
      formatarFonte({
        tipo: "lei",
        documento: "Lei complementar nº 999/2026-TESTE",
        artigo: "Anexo II",
        ficticio: true,
      }),
    ).toBe("Lei complementar nº 999/2026-TESTE, Anexo II (lei fictícia)")
    expect(
      formatarFonte({
        tipo: "cub",
        uf: "CE",
        padrao: "R8-N",
        mesReferencia: "2026-08",
        origem: "Sinduscon-CE",
      }),
    ).toBe("CUB R8-N/CE de ago. de 2026 (Sinduscon-CE)")
    expect(
      formatarFonte({
        tipo: "comparaveis",
        n: 13,
        raioM: 1500,
        desde: "2024-10-12",
        tipologia: "sala_comercial",
        ficticio: true,
      }),
    ).toBe(
      "Mediana de 13 comparáveis (sala comercial) num raio de 1.500 m, desde 12/10/2024 (fictícios)",
    )
    expect(formatarFonte({ tipo: "dado_terreno", campo: "preco_pedido" })).toBe(
      "Cadastro do terreno (preco_pedido)",
    )
    expect(formatarFonte({ tipo: "premissa_usuario" })).toBe("Premissa do usuário")
    expect(formatarFonte({ tipo: "premissa_usuario", observacao: "x" })).toBe(
      "Premissa do usuário: x",
    )
    expect(formatarFonte({ tipo: "default_calibrado", chave: "eficiencia" })).toBe(
      "Default da plataforma",
    )
    expect(
      formatarFonte({ tipo: "default_calibrado", chave: "eficiencia", observacao: "Gabriel" }),
    ).toBe("Default da plataforma: Gabriel")
    expect(
      formatarFonte({
        tipo: "default_calibrado",
        chave: "curvaObra",
        observacao: "Default da plataforma",
      }),
    ).toBe("Default da plataforma")
  })
})

describe("formatarValorPremissa", () => {
  it("usa a unidade", () => {
    expect(formatarValorPremissa({ valor: 0.8, unidade: "%" })).toBe("80%")
    expect(formatarValorPremissa({ valor: 0.155, unidade: "%" })).toBe("15,5%")
    expect(nbsp(formatarValorPremissa({ valor: 5_500_000, unidade: "R$" }))).toBe("R$ 5.500.000,00")
    expect(nbsp(formatarValorPremissa({ valor: 2458.13, unidade: "R$/m²" }))).toBe("R$ 2.458,13/m²")
    expect(formatarValorPremissa({ valor: 30, unidade: "meses" })).toBe("30 meses")
    expect(formatarValorPremissa({ valor: 1, unidade: "meses" })).toBe("1 mês")
    expect(formatarValorPremissa({ valor: 3, unidade: "m" })).toBe("3 m")
    expect(formatarValorPremissa({ valor: 1.3, unidade: "" })).toBe("1,3")
    expect(formatarValorPremissa({ valor: true, unidade: "" })).toBe("Sim")
    expect(formatarValorPremissa({ valor: "permuta_fisica", unidade: "" })).toBe("Permuta física")
    expect(formatarValorPremissa({ valor: "s", unidade: "" })).toBe("Curva S")
  })
})

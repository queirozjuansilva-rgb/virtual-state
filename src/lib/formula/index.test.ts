import { describe, expect, it } from "vitest"

import {
  evaluateFormula,
  FormulaError,
  formatFormula,
  formulaVariables,
  MAX_FORMULA_LENGTH,
  parseFormula,
  tryParseFormula,
} from "./index"

const calc = (src: string, vars = {}) => evaluateFormula(parseFormula(src), vars)

describe("parseFormula + evaluateFormula", () => {
  it.each([
    ["5", 5],
    ["2.5", 2.5],
    [".5", 0.5],
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 - 4 - 3", 3],
    ["24 / 4 / 2", 3],
    ["-3 + 5", 2],
    ["--2", 2],
    ["2 * -3", -6],
    ["min(3, 7)", 3],
    ["max(3, 7, 5)", 7],
    ["floor(2.7)", 2],
    ["ceil(2.1)", 3],
    ["round(2.5)", 3],
  ])("%s = %d", (src, expected) => {
    expect(calc(src)).toBeCloseTo(expected, 10)
  })

  it("calcula recuo em função da altura: max(H/10, 3)", () => {
    expect(calc("max(H/10, 3)", { H: 72 })).toBeCloseTo(7.2)
    expect(calc("max(H/10, 3)", { H: 20 })).toBe(3)
  })

  it("aceita todas as variáveis da lista branca", () => {
    expect(calc("H + P + A + T", { H: 1, P: 2, A: 3, T: 4 })).toBe(10)
  })

  it("ignora espaços e tabs", () => {
    expect(calc("  max( H / 12 ,\t2.5 ) ", { H: 48 })).toBe(4)
  })
})

describe("erros de sintaxe (mensagens em pt-BR)", () => {
  it.each([
    ["", "Fórmula vazia."],
    ["   ", "Fórmula vazia."],
    ["2 +", "A fórmula terminou antes do esperado."],
    ["(2 + 3", "Falta fechar parêntese."],
    ["max(2, 3", "Falta fechar o parêntese de max(…)."],
    ["2 3", "Trecho inesperado depois do fim da fórmula."],
    ["2 + )", "Trecho inesperado na fórmula."],
    ["X + 1", 'Variável desconhecida: "X".'],
    ["h + 1", 'Variável desconhecida: "h".'],
    ["sqrt(4)", 'Função desconhecida: "sqrt".'],
    ["min(3)", "min(…) espera pelo menos 2 argumento(s)."],
    ["floor(1, 2)", "floor(…) espera 1 argumento(s)."],
    ["2,5", "Use ponto como separador decimal (ex.: 2.5)."],
    ["2 ^ 3", 'Caractere não permitido: "^".'],
  ])("%j → %s", (src, message) => {
    const result = tryParseFormula(src)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain(message)
  })

  it("informa a posição do erro", () => {
    const result = tryParseFormula("1 + $")
    expect(!result.ok && result.error.position).toBe(4)
  })

  it("rejeita fórmulas longas demais", () => {
    expect(() => parseFormula("1+".repeat(MAX_FORMULA_LENGTH) + "1")).toThrow(FormulaError)
  })

  it("rejeita aninhamento excessivo", () => {
    expect(() => parseFormula("(".repeat(40) + "1" + ")".repeat(40))).toThrow(
      "Fórmula aninhada demais.",
    )
  })
})

describe("não executa código (sem eval)", () => {
  it.each([
    ["constructor"],
    ["__proto__"],
    ["toString()"],
    ["process.exit()"],
    ['require("fs")'],
    ["H; alert(1)"],
    ["this"],
    ["`x`"],
  ])("rejeita %j", (src) => {
    expect(tryParseFormula(src).ok).toBe(false)
  })
})

describe("evaluateFormula", () => {
  it("exige as variáveis usadas", () => {
    expect(() => calc("H / 10")).toThrow("A fórmula precisa de H (altura da edificação (m))")
  })

  it("recusa divisão por zero", () => {
    expect(() => calc("H / 0", { H: 10 })).toThrow("Divisão por zero")
    expect(() => calc("1 / (H - 10)", { H: 10 })).toThrow("Divisão por zero")
  })

  it("recusa variável não finita", () => {
    expect(() => calc("H", { H: Number.NaN })).toThrow(FormulaError)
  })
})

describe("formulaVariables", () => {
  it("lista as variáveis usadas", () => {
    expect([...formulaVariables(parseFormula("max(H/10, T - 2) + -P"))].sort()).toEqual([
      "H",
      "P",
      "T",
    ])
    expect(formulaVariables(parseFormula("5")).size).toBe(0)
  })
})

describe("formatFormula", () => {
  it.each([
    ["max(H/10,3)", "max(H / 10, 3)"],
    ["(1+2)*3", "(1 + 2) * 3"],
    ["1+2*3", "1 + 2 * 3"],
    ["10-(4-3)", "10 - (4 - 3)"],
    ["(10-4)-3", "10 - 4 - 3"],
    ["24/(4/2)", "24 / (4 / 2)"],
    ["-(H+1)", "-(H + 1)"],
  ])("%s → %s", (src, expected) => {
    const formatted = formatFormula(parseFormula(src))
    expect(formatted).toBe(expected)
    // A forma canônica preserva o significado.
    expect(calc(formatted, { H: 7 })).toBe(calc(src, { H: 7 }))
  })
})

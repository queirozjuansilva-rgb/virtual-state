import { describe, expect, it } from "vitest"

import {
  formatArea,
  formatBRL,
  formatDate,
  formatMonthYear,
  formatNumber,
  formatPercent,
  parseDecimal,
  toInputNumber,
} from "./index"

// Intl usa espaço não separável entre "R$" e o valor.
const nbsp = (s: string) => s.replace(/ /g, " ")

describe("formatação pt-BR", () => {
  it("formata reais", () => {
    expect(nbsp(formatBRL(4200000))).toBe("R$ 4.200.000,00")
    expect(nbsp(formatBRL(2458.13))).toBe("R$ 2.458,13")
    expect(formatBRL(null)).toBe("—")
  })

  it("formata reais compactos", () => {
    expect(nbsp(formatBRL(4200000, { compact: true }))).toBe("R$ 4,2 mi")
  })

  it("formata área, número e porcentagem", () => {
    expect(formatArea(1200.07)).toBe("1.200,07 m²")
    expect(formatNumber(2.5)).toBe("2,5")
    expect(formatPercent(0.6)).toBe("60%")
    expect(formatPercent(0.155)).toBe("15,5%")
    expect(formatArea(undefined)).toBe("—")
  })

  it("formata datas de referência sem deslocar fuso", () => {
    expect(formatMonthYear("2026-08-01")).toBe("ago. de 2026")
    expect(formatDate("2026-02-01")).toBe("01/02/2026")
  })
})

describe("parseDecimal", () => {
  it.each([
    ["1.200,50", 1200.5],
    ["1200,5", 1200.5],
    ["1200.5", 1200.5],
    ["1.200", 1200],
    ["1.200.000", 1200000],
    ["4.200.000,00", 4200000],
    ["1,200.50", 1200.5],
    ["0,6", 0.6],
    [".5", 0.5],
    ["-3,5", -3.5],
    ["R$ 2.458,13", 2458.13],
    ["60%", 60],
    ["300 m²", 300],
  ])("%s → %d", (input, expected) => {
    expect(parseDecimal(input)).toBeCloseTo(expected, 10)
  })

  it("devolve null para vazio", () => {
    expect(parseDecimal("")).toBeNull()
    expect(parseDecimal("   ")).toBeNull()
    expect(parseDecimal(null)).toBeNull()
  })

  it.each([["abc"], ["1,2,3"], ["12a"]])("devolve NaN para %s", (input) => {
    expect(parseDecimal(input)).toBeNaN()
  })
})

describe("toInputNumber", () => {
  it("formata para input pt-BR", () => {
    expect(toInputNumber(1200.5)).toBe("1200,5")
    expect(toInputNumber("0.6000", 100)).toBe("60")
    expect(toInputNumber(0.155, 100)).toBe("15,5")
    expect(toInputNumber(null)).toBe("")
    expect(toInputNumber("")).toBe("")
  })
})

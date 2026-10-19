import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  checkbox,
  dbErrorState,
  optionalDate,
  optionalDecimal,
  optionalEnum,
  optionalPercentAsFraction,
  optionalText,
  optionalUuid,
  requiredDecimal,
  requiredText,
  zodErrorState,
} from "./index"

describe("campos de formulário", () => {
  it("texto obrigatório e opcional", () => {
    expect(requiredText().safeParse("  ").success).toBe(false)
    expect(requiredText().parse(" Fortaleza ")).toBe("Fortaleza")
    expect(optionalText().parse("   ")).toBeNull()
    expect(optionalText().parse(null)).toBeNull()
  })

  it("decimal opcional em pt-BR", () => {
    const schema = optionalDecimal({ min: 0 })
    expect(schema.parse("1.200,50")).toBe(1200.5)
    expect(schema.parse("")).toBeNull()
    expect(schema.safeParse("abc").success).toBe(false)
    expect(schema.safeParse("-1").error?.issues[0]?.message).toBe("Deve ser maior ou igual a 0.")
  })

  it("decimal obrigatório", () => {
    const schema = requiredDecimal({ min: 1, integer: true }, "Informe a quantidade.")
    expect(schema.parse("12")).toBe(12)
    expect(schema.safeParse("").error?.issues[0]?.message).toBe("Informe a quantidade.")
    expect(schema.safeParse("1,5").error?.issues[0]?.message).toBe("Use um número inteiro.")
  })

  it("percentual vira fração", () => {
    expect(optionalPercentAsFraction().parse("60")).toBe(0.6)
    expect(optionalPercentAsFraction().parse("15,5")).toBe(0.155)
    expect(optionalPercentAsFraction().parse("")).toBeNull()
    expect(optionalPercentAsFraction().safeParse("120").success).toBe(false)
  })

  it("checkbox, uuid, enum e data", () => {
    expect(checkbox().parse("on")).toBe(true)
    expect(checkbox().parse(null)).toBe(false)
    expect(optionalUuid().parse("")).toBeNull()
    expect(optionalUuid().safeParse("x").success).toBe(false)
    expect(optionalEnum(["a", "b"] as const).parse("b")).toBe("b")
    expect(optionalEnum(["a", "b"] as const).parse("")).toBeNull()
    expect(optionalDate().parse("2026-02-01")).toBe("2026-02-01")
    expect(optionalDate().safeParse("01/02/2026").success).toBe(false)
  })
})

describe("estados de erro", () => {
  it("agrupa erros do Zod por campo", () => {
    const schema = z.object({
      nome: requiredText("Informe o nome."),
      area: optionalDecimal({ min: 0 }),
    })
    const result = schema.safeParse({ nome: "", area: "-2" })
    const state = zodErrorState(result.error!)
    expect(state.fieldErrors?.nome).toEqual(["Informe o nome."])
    expect(state.fieldErrors?.area).toEqual(["Deve ser maior ou igual a 0."])
  })

  it("traduz códigos do Postgres", () => {
    expect(dbErrorState({ code: "23505", message: "dup" }).error).toContain("duplicado")
    expect(dbErrorState({ code: "42501", message: "rls" }).error).toContain("permissão")
    expect(dbErrorState({ message: "outro" }).error).toBe("Não foi possível salvar: outro")
    expect(dbErrorState({ code: "VEJ01", message: "trava" }).error).toMatch(
      /^Homologação bloqueada — vigência sob análise jurídica\. Salve como rascunho/,
    )
    expect(dbErrorState({ code: "22023", message: "Informe a data do parecer." }).error).toBe(
      "Informe a data do parecer.",
    )
  })
})

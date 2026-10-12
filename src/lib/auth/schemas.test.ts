import { describe, expect, it } from "vitest"

import { authErrorMessage, GENERIC_AUTH_ERROR } from "./errors"
import { loginSchema, magicLinkSchema, safeNextPath, signupSchema } from "./schemas"

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/relatorios/1?x=2")).toBe("/relatorios/1?x=2")
  })

  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["relatorios"],
    [""],
    [null],
    [undefined],
    [123],
  ])("rejeita %j e cai no fallback", (value) => {
    expect(safeNextPath(value)).toBe("/")
  })

  it("respeita o fallback informado", () => {
    expect(safeNextPath("//x", "/login")).toBe("/login")
  })
})

describe("schemas de autenticação", () => {
  it("normaliza o e-mail", () => {
    const parsed = magicLinkSchema.parse({ email: "  Gabriel@Exemplo.COM " })
    expect(parsed.email).toBe("gabriel@exemplo.com")
  })

  it("rejeita e-mail inválido com mensagem em pt-BR", () => {
    const result = loginSchema.safeParse({ email: "nao-e-email", password: "x" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Informe um e-mail válido.")
  })

  it("exige senha com 8+ caracteres no cadastro", () => {
    const result = signupSchema.safeParse({
      fullName: "Pedro",
      email: "pedro@exemplo.com",
      password: "1234567",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["password"])
  })

  it("aceita cadastro válido", () => {
    const result = signupSchema.safeParse({
      fullName: "  Pedro Catunda ",
      email: "pedro@exemplo.com",
      password: "senha-forte-123",
    })
    expect(result.success).toBe(true)
    expect(result.data?.fullName).toBe("Pedro Catunda")
  })
})

describe("authErrorMessage", () => {
  it("traduz códigos conhecidos", () => {
    expect(authErrorMessage("invalid_credentials")).toBe("E-mail ou senha incorretos.")
  })

  it("usa mensagem genérica para códigos desconhecidos", () => {
    expect(authErrorMessage("algo_novo")).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR)
  })
})

import { describe, expect, it } from "vitest"

import { parseResolucaoPendencia } from "./pendencia-input"

const HOJE = "2026-10-19"
const valido = {
  parecer: "Texto de teste no lugar da conclusão do parecer.",
  responsavel: "Fulana de Tal, OAB/CE 0000",
  data: "2026-10-18",
  referencia: "Parecer nº 12/2026",
  confirmacao: "on",
}

const errosDe = (input: Record<string, unknown>) => {
  const r = parseResolucaoPendencia(input, HOJE)
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]))
}

describe("encerramento de pendência jurídica", () => {
  it("aceita parecer, responsável, data e confirmação; referência é opcional", () => {
    const r = parseResolucaoPendencia({ ...valido, referencia: "" }, HOJE)
    expect(r.success && r.data).toEqual({
      parecer: valido.parecer,
      responsavel: valido.responsavel,
      data: "2026-10-18",
      referencia: null,
      confirmacao: true,
    })
  })

  it("aceita parecer com a data de hoje", () => {
    expect(parseResolucaoPendencia({ ...valido, data: HOJE }, HOJE).success).toBe(true)
  })

  it.each([
    ["parecer", { parecer: "" }, /conclusão do parecer/],
    ["parecer", { parecer: "curto" }, /ao menos 10/],
    ["responsavel", { responsavel: "  " }, /responsável/],
    ["data", { data: "" }, /data do parecer/],
    ["data", { data: "18/10/2026" }, /Data inválida/],
    ["data", { data: "2026-10-20" }, /futura/],
    ["confirmacao", { confirmacao: undefined }, /Confirme/],
  ])("recusa %s inválido(a): %o", (campo, mudanca, mensagem) => {
    expect(errosDe({ ...valido, ...mudanca })[campo]).toMatch(mensagem)
  })
})

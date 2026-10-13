import { describe, expect, it } from "vitest"

import { calcularViabilidade } from "@/lib/feasibility"
import { entradaCaso01 } from "@/lib/feasibility/fixtures.test-utils"

import {
  aplicarEdicoes,
  alteracoesEntre,
  CAMPOS_EDITAVEIS,
  FONTE_AJUSTE,
  valoresDaEntrada,
} from "./edicao"
import { geometriaFluxo, passoRedondo } from "./grafico"

describe("aplicarEdicoes", () => {
  const entrada = entradaCaso01()

  it("altera só o que mudou e marca a fonte como premissa do usuário", () => {
    const r = aplicarEdicoes(entrada, {
      precoVendaM2: 13_000,
      prazoObraMeses: entrada.premissas.prazoObraMeses, // igual: não conta como alteração
      impostosPct: 0.06,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alteradas).toEqual(["precoVendaM2", "impostosPct"])
    expect(r.entrada.mercado).toMatchObject({ precoVendaM2: 13_000, fontePreco: FONTE_AJUSTE })
    expect(r.entrada.premissas.impostosPct).toBe(0.06)
    expect(r.entrada.fontes.impostosPct).toEqual(FONTE_AJUSTE)
    expect(r.entrada.fontes.prazoObraMeses).toEqual(entrada.fontes.prazoObraMeses)
    // A entrada original não muda.
    expect(entrada.premissas.impostosPct).not.toBe(0.06)
  })

  it("o recálculo reflete a edição (preço maior, VGV maior)", () => {
    const antes = calcularViabilidade(entrada)
    const r = aplicarEdicoes(entrada, { precoVendaM2: entrada.mercado.precoVendaM2 * 1.1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const depois = calcularViabilidade(r.entrada)
    expect(depois.base!.metricas.vgv).toBeCloseTo(antes.base!.metricas.vgv * 1.1, 2)
    expect(depois.premissas.find((p) => p.chave === "precoVendaM2")?.fonte).toEqual(FONTE_AJUSTE)
  })

  it("rejeita tipo errado, campo não editável e regra das premissas violada", () => {
    expect(aplicarEdicoes(entrada, { eficiencia: "alta" })).toMatchObject({
      ok: false,
      erros: { eficiencia: "Valor inválido." },
    })
    expect(aplicarEdicoes(entrada, { margemMinimaConservador: 0.5 } as never)).toMatchObject({
      ok: false,
      erros: { margemMinimaConservador: "Campo não editável." },
    })
    expect(aplicarEdicoes(entrada, { recebimentoSinalPct: 0.5 })).toMatchObject({
      ok: false,
      erros: { recebimentoChavesPct: "Sinal + mensais + chaves devem somar 100%." },
    })
    expect(aplicarEdicoes(entrada, { precoVendaM2: 0 })).toMatchObject({
      ok: false,
      erros: { precoVendaM2: expect.stringMatching(/maior que zero/) },
    })
    expect(
      aplicarEdicoes(entrada, { formaAquisicao: "permuta_fisica", permutaPct: 0 }),
    ).toMatchObject({
      ok: false,
      erros: { permutaPct: "Informe o percentual de permuta." },
    })
  })

  it("lista as alterações entre versões", () => {
    const r = aplicarEdicoes(entrada, {
      fatorCub: 1.4,
      usarCaMaximo: !entrada.premissas.usarCaMaximo,
    })
    if (!r.ok) throw new Error("esperava sucesso")
    expect(alteracoesEntre(entrada, r.entrada).map((a) => a.chave)).toEqual([
      "fatorCub",
      "usarCaMaximo",
    ])
  })

  it("todo campo editável tem valor na entrada", () => {
    const valores = valoresDaEntrada(entrada)
    for (const c of CAMPOS_EDITAVEIS) expect(valores[c.chave]).not.toBeUndefined()
  })
})

describe("gráfico do fluxo acumulado", () => {
  it("passos redondos", () => {
    expect(passoRedondo(10_000_000)).toBe(2_500_000)
    expect(passoRedondo(7_300_000)).toBe(2_000_000)
    expect(passoRedondo(0)).toBe(1)
  })

  it("marca a exposição máxima, o payback, o zero e os eixos", () => {
    const fluxo = calcularViabilidade(entradaCaso01()).base!.fluxo
    const g = geometriaFluxo(fluxo, 640, 240)
    expect(g.pontos).toHaveLength(fluxo.length)
    expect(g.caminho.startsWith("M")).toBe(true)
    const menor = Math.min(...fluxo.map((m) => m.acumulado))
    expect(g.minimo?.acumulado).toBe(menor)
    expect(g.zeroY).toBeGreaterThan(g.margens.topo)
    expect(g.zeroY).toBeLessThan(240 - g.margens.base)
    expect(g.ticksY.some((t) => t.valor === 0)).toBe(true)
    expect(g.ticksX[0]).toMatchObject({ mes: 0 })
    if (g.payback)
      expect(fluxo.find((m) => m.mes === g.payback!.mes)!.acumulado).toBeGreaterThanOrEqual(0)
  })
})

describe("formulário", () => {
  it("valores com mais casas que o formulário não contam como alteração", async () => {
    const { edicoesAlteradas, edicoesDoFormulario, formularioDaEntrada } =
      await import("@/components/relatorio/variaveis")
    const entrada = entradaCaso01()
    entrada.mercado.precoVendaM2 = (12560.61 + 12961.24) / 2
    const form = formularioDaEntrada(entrada)
    const { edicoes, erros } = edicoesDoFormulario(form)
    expect(erros).toEqual({})
    expect(edicoesAlteradas(entrada, edicoes)).toEqual({})
    const outro = edicoesDoFormulario({ ...form, impostosPct: "6" })
    expect(edicoesAlteradas(entrada, outro.edicoes)).toEqual({ impostosPct: 0.06 })
    expect(edicoesDoFormulario({ ...form, prazoObraMeses: "30,5" }).erros).toEqual({
      prazoObraMeses: "Use um número inteiro de meses.",
    })
  })
})

import { describe, expect, it } from "vitest"

import { entradaCaso01 } from "./fixtures.test-utils"
import { calcularViabilidade } from "./index"

/**
 * Caso de conferência 01 (docs/validacao/caso-01.md). Os valores esperados
 * vêm de um cálculo independente (planilha/Python), não deste código. Se este
 * teste quebrar, ou o motor mudou (suba ENGINE_VERSION e refaça o caso) ou há
 * um bug.
 */
const r = calcularViabilidade(entradaCaso01())
const cenario = (nome: string) => r.cenarios.find((c) => c.cenario === nome)!.metricas

describe("caso-01: ZT-2, residencial vertical, 2.000 m²", () => {
  it("status e versão", () => {
    expect(r.status).toBe("ok")
    expect(r.versaoMotor).toBe("0.1.0")
    expect(r.pendencias).toEqual([])
  })

  it("Etapa A: potencial construtivo", () => {
    const p = r.potencial!
    expect(p.profundidadeM).toBe(50)
    expect(p.areaComputavelAlvoM2).toBe(3000)
    expect(p.areaComputavelM2).toBe(3000)
    expect(p.pavimentos).toBe(3)
    expect(p.alturaM).toBe(9)
    expect(p.recuosM).toEqual({ frontal: 5, lateral: 2.5, fundos: 2.5 })
    expect(p.projecaoRecuosM2).toBeCloseTo(1487.5, 9)
    expect(p.projecaoM2).toBeCloseTo(1200, 9)
    expect(p.limitante).toBe("coeficiente_aproveitamento")
    expect(p.projecaoLimitadaPor).toBe("taxa_ocupacao")
    expect(p.areaNaoComputavelM2).toBeCloseTo(1200, 9)
    expect(p.areaConstruidaTotalM2).toBeCloseTo(4200, 9)
    expect(p.areaEquivalenteM2).toBeCloseTo(3600, 9)
    expect(p.areaPrivativaM2).toBeCloseTo(2400, 9)
    expect(p.areaAdicionalOutorgaM2).toBe(0)
  })

  it("Etapas B e C: receita e custos", () => {
    const b = r.base!
    expect(b.vgv).toBeCloseTo(26_400_000, 4)
    expect(b.custos.terreno).toBe(5_500_000)
    expect(b.custos.itbiRegistro).toBeCloseTo(220_000, 4)
    expect(b.custos.construcao).toBeCloseTo(11_504_048.4, 4)
    expect(b.custos.projetos).toBeCloseTo(460_161.936, 4)
    expect(b.custos.outorga).toBe(0)
    expect(b.custos.marketing).toBeCloseTo(792_000, 4)
    expect(b.custos.corretagem).toBeCloseTo(1_320_000, 4)
    expect(b.custos.administracao).toBeCloseTo(345_121.452, 4)
    expect(b.custos.contingencia).toBeCloseTo(575_202.42, 4)
    expect(b.custos.impostos).toBeCloseTo(1_056_000, 4)
    expect(b.custos.total).toBeCloseTo(21_772_534.208, 4)
  })

  it("Etapa D: fluxo e métricas (cenário base)", () => {
    const m = r.base!.metricas
    expect(m.lucro).toBeCloseTo(4_627_465.792, 3)
    expect(m.margemVgv).toBeCloseTo(0.175282795, 8)
    expect(m.exposicaoMaxima).toBeCloseTo(13_783_852.876, 2)
    expect(m.roi).toBeCloseTo(0.335716424, 8)
    expect(m.tirMensal).toBeCloseTo(0.0110386797, 9)
    expect(m.tirAnual).toBeCloseTo(0.1408098198, 8)
    expect(m.paybackMeses).toBe(37)
    expect(m.prazoTotalMeses).toBe(37)
    // O fluxo fecha: entradas − saídas = receita − custos.
    expect(m.lucro).toBeCloseTo(r.base!.receitaIncorporador - r.base!.custos.total, 4)
  })

  it("Etapa E: cenários", () => {
    const c = cenario("conservador")
    expect(c.vgv).toBeCloseTo(23_760_000, 4)
    expect(c.custoTotal).toBeCloseTo(22_744_187.6288, 3)
    expect(c.lucro).toBeCloseTo(1_015_812.3712, 3)
    expect(c.margemVgv).toBeCloseTo(0.0427530459, 8)
    expect(c.exposicaoMaxima).toBeCloseTo(16_277_973.438, 2)
    expect(c.tirAnual).toBeCloseTo(0.0299579417, 8)
    expect(c.paybackMeses).toBe(40)
    expect(c.prazoTotalMeses).toBe(42)

    const o = cenario("otimista")
    expect(o.lucro).toBeCloseTo(6_433_292.5024, 3)
    expect(o.margemVgv).toBeCloseTo(0.2320812591, 8)
    expect(o.tirAnual).toBeCloseTo(0.1980271179, 8)
    expect(o.paybackMeses).toBe(37)
  })

  it("Etapa F: risco (só a margem conservadora baixa dispara)", () => {
    expect(r.risco.flags.map((f) => f.codigo)).toEqual(["margem_conservadora_baixa"])
    expect(r.risco.score).toBe(20)
    expect(r.risco.nivel).toBe("baixo")
  })

  it("rastreabilidade: premissas com fonte", () => {
    const cub = r.premissas.find((p) => p.chave === "cubM2")!
    expect(cub.valor).toBe(2458.13)
    expect(cub.fonte).toMatchObject({ tipo: "cub", uf: "CE", mesReferencia: "2026-08" })
    const eficiencia = r.premissas.find((p) => p.chave === "eficiencia")!
    expect(eficiencia.fonte).toEqual({ tipo: "default_calibrado", chave: "eficiencia" })
    expect(r.disclaimer).toContain("Estudo preliminar automatizado")
  })
})

describe("caso-01: fonte do preço de venda", () => {
  it("aparece na lista de premissas", () => {
    const preco = r.premissas[0]!
    expect(preco).toMatchObject({ chave: "precoVendaM2", valor: 11_000, unidade: "R$/m²" })
    expect(preco.fonte).toMatchObject({ tipo: "comparaveis", n: 10, raioM: 1500 })
  })
})

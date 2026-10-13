import { describe, expect, it } from "vitest"

import { premissasCaso01 } from "./fixtures.test-utils"
import { estatisticaComparaveis, nivelRisco, premissasSchema, ranquearUsos } from "./index"
import { anualizar, exposicaoMaxima, payback, tir, vpl } from "./metricas"

describe("métricas", () => {
  it("VPL", () => {
    expect(vpl([-100, 110], 0.1)).toBeCloseTo(0, 12)
    expect(vpl([-100, 50, 60], 0)).toBe(10)
  })

  it("TIR de fluxos conhecidos", () => {
    expect(tir([-100, 110])).toBeCloseTo(0.1, 9)
    expect(tir([-1000, 300, 400, 500])).toBeCloseTo(0.0889633947, 8)
    // Taxa negativa
    expect(tir([-100, 90])).toBeCloseTo(-0.1, 9)
  })

  it("TIR inexistente", () => {
    expect(tir([100, 200])).toBeNull()
    expect(tir([-100, -200])).toBeNull()
    expect(tir([0, 0])).toBeNull()
    // Retorno acima de 100% ao mês fica fora do intervalo pesquisado.
    expect(tir([-1, 10])).toBeNull()
  })

  it("anualização", () => {
    expect(anualizar(0.01)).toBeCloseTo(0.12682503, 8)
    expect(anualizar(null)).toBeNull()
  })

  it("payback e exposição", () => {
    expect(payback([10, 20])).toBe(0)
    expect(payback([-10, -5, 3, 8])).toBe(2)
    expect(payback([-10, 5, -2, 4])).toBe(3)
    expect(payback([-10, -5])).toBeNull()
    expect(exposicaoMaxima([-10, -30, 5])).toBe(30)
    expect(exposicaoMaxima([1, 2])).toBe(0)
  })
})

describe("estatisticaComparaveis", () => {
  it("mediana, média, desvio amostral e CV", () => {
    const e = estatisticaComparaveis([10_000, 12_000, 11_000, 9_000])!
    expect(e.n).toBe(4)
    expect(e.medianaM2).toBe(10_500)
    expect(e.mediaM2).toBe(10_500)
    expect(e.desvioPadraoM2).toBeCloseTo(1290.994449, 5)
    expect(e.cv).toBeCloseTo(0.1229518523, 9)
    expect([e.minM2, e.maxM2]).toEqual([9_000, 12_000])
  })

  it("amostra ímpar, única e vazia; ignora inválidos", () => {
    expect(estatisticaComparaveis([3, 1, 2])!.medianaM2).toBe(2)
    const unico = estatisticaComparaveis([8_000, Number.NaN, -1, 0])!
    expect(unico.n).toBe(1)
    expect(unico.desvioPadraoM2).toBe(0)
    expect(estatisticaComparaveis([])).toBeNull()
  })
})

describe("nível de risco", () => {
  it("limiares", () => {
    const cfg = { limiarMedio: 25, limiarAlto: 50 }
    expect(nivelRisco(0, cfg)).toBe("baixo")
    expect(nivelRisco(24, cfg)).toBe("baixo")
    expect(nivelRisco(25, cfg)).toBe("medio")
    expect(nivelRisco(50, cfg)).toBe("alto")
  })
})

describe("premissasSchema", () => {
  it("aceita as premissas do caso-01", () => {
    expect(premissasSchema.safeParse(premissasCaso01()).success).toBe(true)
  })

  it("exige recebimento somando 100%", () => {
    const r = premissasSchema.safeParse(premissasCaso01({ recebimentoChavesPct: 0.6 }))
    expect(r.error?.issues[0]?.message).toBe("Sinal + mensais + chaves devem somar 100%.")
  })

  it("exige % de permuta e preço do terreno conforme a forma de aquisição", () => {
    expect(
      premissasSchema.safeParse(
        premissasCaso01({ formaAquisicao: "permuta_fisica", permutaPct: 0 }),
      ).error?.issues[0]?.message,
    ).toBe("Informe o percentual de permuta.")
    expect(
      premissasSchema.safeParse(premissasCaso01({ precoTerreno: 0 })).error?.issues[0]?.message,
    ).toBe("Informe o preço do terreno.")
    expect(
      premissasSchema.safeParse(
        premissasCaso01({ formaAquisicao: "permuta_fisica", permutaPct: 0.2, precoTerreno: 0 }),
      ).success,
    ).toBe(true)
  })

  it("rejeita prazos e frações fora do intervalo", () => {
    expect(premissasSchema.safeParse(premissasCaso01({ prazoObraMeses: 0 })).success).toBe(false)
    expect(premissasSchema.safeParse(premissasCaso01({ eficiencia: 1.2 })).success).toBe(false)
  })
})

describe("ranquearUsos", () => {
  it("lista vazia", () => {
    expect(ranquearUsos([])).toEqual([])
  })
})

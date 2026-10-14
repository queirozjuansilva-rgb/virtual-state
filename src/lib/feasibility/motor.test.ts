import { describe, expect, it } from "vitest"

import { curvaDesembolso, curvaVendas } from "./financeiro"
import { entradaCaso01 } from "./fixtures.test-utils"
import { calcularViabilidade, ranquearUsos } from "./index"
import { MAX_PAVIMENTOS_SEM_GABARITO } from "./potencial"

const rodar = (over: Parameters<typeof entradaCaso01>[0] = {}) =>
  calcularViabilidade(entradaCaso01(over))

const codigos = (r: ReturnType<typeof rodar>) => r.risco.flags.map((f) => f.codigo)

describe("Etapa A: potencial construtivo", () => {
  it("CA máximo com outorga: área adicional e custo da outorga", () => {
    const r = rodar({ premissas: { usarCaMaximo: true } })
    const p = r.potencial!
    expect(p.caAplicado).toBe(2.5)
    expect(p.usaOutorga).toBe(true)
    expect(p.areaComputavelAlvoM2).toBe(5000)
    // 1200 m² × 5 pavimentos = 6000 ≥ 5000 → 5 pavimentos.
    expect(p.pavimentos).toBe(5)
    expect(p.areaComputavelM2).toBe(5000)
    expect(p.areaAdicionalOutorgaM2).toBe(2000)
    // 2000 m² × (5,5 mi ÷ 2000 m²) × 0,3
    expect(r.base!.custos.outorga).toBeCloseTo(1_650_000, 6)
  })

  it("CA máximo sem validação cai para o básico, com aviso", () => {
    const r = rodar({ premissas: { usarCaMaximo: true }, regra: { caMaximo: null } })
    expect(r.potencial!.caAplicado).toBe(1.5)
    expect(r.avisos).toContain("CA máximo não validado: usado o CA básico.")
  })

  it("outorga sem fator validado: custo zero, aviso e flag de parâmetro ausente", () => {
    const r = rodar({ premissas: { usarCaMaximo: true }, regra: { outorgaFator: null } })
    expect(r.base!.custos.outorga).toBe(0)
    expect(r.avisos.some((a) => a.includes("Fator de outorga"))).toBe(true)
    expect(r.risco.flags.find((f) => f.codigo === "parametro_ausente")?.detalhe).toContain(
      "fator de outorga",
    )
  })

  it("recuo por fórmula limita a projeção quando o prédio sobe", () => {
    // Lote estreito e TO alta: o recuo lateral H/4 cresce com a altura.
    const r = rodar({
      terreno: { areaM2: 1000, testadaM: 20 },
      regra: {
        caBasico: 4,
        toMax: 0.9,
        recuoFrontal: "0",
        recuoFundos: "0",
        recuoLateral: "max(H / 4, 1.5)",
        gabaritoPavimentos: 20,
        gabaritoM: 60,
      },
    })
    const p = r.potencial!
    // Capacidade n × (20 − 2·máx(0,75n; 1,5)) × 50 tem máximo em n = 7 (7 × 9,5 × 50 = 3325).
    expect(p.pavimentos).toBe(7)
    expect(p.recuosM.lateral).toBeCloseTo(5.25, 9)
    expect(p.areaComputavelM2).toBeCloseTo(3325, 9)
    expect(p.limitante).toBe("recuos")
    expect(p.projecaoLimitadaPor).toBe("recuos")
  })

  it("gabarito limita a área computável", () => {
    const r = rodar({ regra: { caBasico: 4, gabaritoPavimentos: 4, gabaritoM: null } })
    const p = r.potencial!
    expect(p.pavimentos).toBe(4)
    expect(p.areaComputavelM2).toBeCloseTo(4800, 9)
    expect(p.limitante).toBe("gabarito")
  })

  it("lote de esquina troca um recuo lateral pelo frontal", () => {
    const p = rodar({ terreno: { esquina: true }, regra: { toMax: 1 } }).potencial!
    // (40 − 2,5 − 5) × (50 − 5 − 2,5)
    expect(p.projecaoRecuosM2).toBeCloseTo(32.5 * 42.5, 9)
  })

  it("sem testada: lote estimado como quadrado, aviso e flag", () => {
    const r = rodar({ terreno: { testadaM: null } })
    expect(r.potencial!.testadaEstimada).toBe(true)
    expect(r.potencial!.testadaM).toBeCloseTo(Math.sqrt(2000), 9)
    expect(codigos(r)).toContain("testada_estimada")
  })

  it("sem TO nem gabarito nem recuos validados: avisos e flag de parâmetro ausente", () => {
    const r = rodar({
      regra: {
        toMax: null,
        gabaritoM: null,
        gabaritoPavimentos: null,
        recuoFrontal: null,
        recuoLateral: null,
        recuoFundos: null,
      },
    })
    expect(r.status).toBe("ok")
    expect(r.avisos.join(" ")).toContain("Taxa de ocupação não validada")
    expect(r.avisos.join(" ")).toContain(`teto técnico de ${MAX_PAVIMENTOS_SEM_GABARITO}`)
    expect(r.avisos.join(" ")).toContain("Recuo frontal não validado")
    const detalhe = r.risco.flags.find((f) => f.codigo === "parametro_ausente")!.detalhe
    expect(detalhe).toContain("taxa de ocupação")
    expect(detalhe).toContain("gabarito")
  })

  it("gabarito menor que um pavimento: pendência", () => {
    const r = rodar({ regra: { gabaritoM: 2, gabaritoPavimentos: null } })
    expect(r.status).toBe("incompleto")
    expect(r.pendencias[0]).toContain("gabarito não comporta")
    expect(r.base).toBeNull()
  })

  it("recuos que consomem o lote: pendência", () => {
    const r = rodar({ regra: { recuoLateral: "25" } })
    expect(r.status).toBe("incompleto")
    expect(r.pendencias).toContain("Os recuos não deixam área edificável no lote.")
  })

  it("fórmula de recuo inválida ou que divide por zero: pendência", () => {
    expect(rodar({ regra: { recuoFrontal: "max(H" } }).pendencias[0]).toContain(
      "Recuo frontal com fórmula inválida",
    )
    expect(rodar({ regra: { recuoFrontal: "H / (P - 1)" } }).pendencias[0]).toContain(
      "Não foi possível calcular os recuos com 1 pavimento",
    )
  })

  it("CA básico ausente: incompleto", () => {
    const r = rodar({ regra: { caBasico: null } })
    expect(r.status).toBe("incompleto")
    expect(r.pendencias).toContain("CA básico não validado para este uso na zona.")
  })
})

describe("status da regra", () => {
  it("uso não permitido: sem números, com flag", () => {
    const r = rodar({ regra: { permitido: false } })
    expect(r.status).toBe("uso_nao_permitido")
    expect(r.potencial).toBeNull()
    expect(r.cenarios).toEqual([])
    expect(codigos(r)).toContain("uso_nao_permitido")
  })

  it("sem regra validada: incompleto, com flag", () => {
    const r = rodar({ regra: { status: "ausente" } })
    expect(r.status).toBe("incompleto")
    expect(codigos(r)).toContain("regra_nao_validada")
  })
})

describe("Etapas B e C: formas de aquisição", () => {
  it("permuta física: receita sem as unidades do proprietário; ITBI sobre o valor da permuta", () => {
    const r = rodar({ premissas: { formaAquisicao: "permuta_fisica", permutaPct: 0.2 } })
    const b = r.base!
    expect(b.vgv).toBeCloseTo(26_400_000, 4)
    expect(b.receitaIncorporador).toBeCloseTo(21_120_000, 4)
    expect(b.custos.terreno).toBe(0)
    expect(b.custos.itbiRegistro).toBeCloseTo(26_400_000 * 0.2 * 0.04, 4)
    expect(b.custos.corretagem).toBeCloseTo(21_120_000 * 0.05, 4)
    expect(b.metricas.margemVgv).toBeCloseTo(b.metricas.lucro / b.vgv, 12)
    expect(b.metricas.margemReceita).toBeCloseTo(b.metricas.lucro / b.receitaIncorporador, 12)
  })

  it("permuta financeira: percentual das receitas repassado ao proprietário", () => {
    const b = rodar({ premissas: { formaAquisicao: "permuta_financeira", permutaPct: 0.15 } }).base!
    expect(b.receitaIncorporador).toBeCloseTo(26_400_000, 4)
    expect(b.custos.permutaFinanceira).toBeCloseTo(26_400_000 * 0.15, 4)
    expect(b.custos.terreno).toBe(0)
    expect(b.metricas.lucro).toBeCloseTo(b.receitaIncorporador - b.custos.total, 4)
  })

  it("misto: preço em dinheiro + permuta física", () => {
    const b = rodar({ premissas: { formaAquisicao: "misto", permutaPct: 0.1 } }).base!
    expect(b.custos.terreno).toBe(5_500_000)
    expect(b.receitaIncorporador).toBeCloseTo(26_400_000 * 0.9, 4)
    expect(b.custos.itbiRegistro).toBeCloseTo((5_500_000 + 2_640_000) * 0.04, 4)
  })
})

describe("Etapa D: fluxo de caixa", () => {
  it("sem aprovação: projetos e outorga no mês 0", () => {
    const r = rodar({ premissas: { prazoAprovacaoMeses: 0, usarCaMaximo: true } })
    const mes0 = r.base!.fluxo[0]!
    const c = r.base!.custos
    expect(mes0.saidas).toBeCloseTo(c.terreno + c.itbiRegistro + c.projetos + c.outorga, 4)
  })

  it("vendas que passam das chaves: recebimento integral no mês da venda", () => {
    const r = rodar({ premissas: { prazoObraMeses: 6, prazoVendasMeses: 20, curvaObra: "linear" } })
    const b = r.base!
    expect(b.metricas.prazoTotalMeses).toBe(6 + 20)
    const totalEntradas = b.fluxo.reduce((s, m) => s + m.entradas, 0)
    expect(totalEntradas).toBeCloseTo(b.receitaIncorporador, 4)
    // Último mês de vendas (após as chaves): recebe a fração vendida inteira.
    const fracaoMensal = (1 - 0.3) / 20
    expect(b.fluxo.at(-1)!.entradas).toBeCloseTo(fracaoMensal * b.receitaIncorporador, 4)
  })

  it("prejuízo: payback e TIR podem não existir", () => {
    const m = rodar({ precoVendaM2: 3_000 }).base!.metricas
    expect(m.lucro).toBeLessThan(0)
    expect(m.paybackMeses).toBeNull()
    expect(m.tirMensal === null || m.tirMensal < 0).toBe(true)
  })

  it("curvas somam 1", () => {
    const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    expect(soma(curvaVendas(24, 0.3))).toBeCloseTo(1, 12)
    expect(soma(curvaVendas(1, 0.3))).toBeCloseTo(1, 12)
    expect(soma(curvaDesembolso(30, "s"))).toBeCloseTo(1, 12)
    expect(soma(curvaDesembolso(7, "linear"))).toBeCloseTo(1, 12)
    const s = curvaDesembolso(30, "s")
    expect(s[14]!).toBeGreaterThan(s[0]!)
    expect(curvaVendas(4, 1.5)[0]).toBe(1)
  })
})

describe("Etapa F: risco", () => {
  it("dispara as flags físicas, jurídicas e urbanísticas", () => {
    const r = rodar({
      terreno: {
        areaM2: 300,
        testadaM: 10,
        declividadePct: 18,
        matriculaInformada: false,
        onusRegistrado: true,
        zona: { codigo: "ZT-2", atribuicao: "manual", zonasCruzadas: 2 },
        restricoes: [
          { tipo: "app", sobreposicaoM2: 311.4, origem: "APP de teste" },
          { tipo: "area_alagavel", sobreposicaoM2: null, origem: "Checklist" },
          { tipo: "tombamento", sobreposicaoM2: null, origem: "Checklist" },
        ],
      },
    })
    const c = codigos(r)
    for (const esperado of [
      "zona_atribuida_manualmente",
      "lote_multiplas_zonas",
      "restricao_app",
      "restricao_alagavel",
      "restricao_ambiental_outra",
      "topografia_acentuada",
      "area_abaixo_minimo",
      "testada_abaixo_minimo",
      "matricula_ausente",
      "onus_registrado",
    ]) {
      expect(c).toContain(esperado)
    }
    expect(r.risco.flags.find((f) => f.codigo === "restricao_app")!.detalhe).toBe(
      "APP de teste (311 m²)",
    )
    expect(r.risco.score).toBe(100)
    expect(r.risco.nivel).toBe("alto")
    expect(r.risco.porEixo.juridico).toBe(35)
  })

  it("zona não identificada", () => {
    const r = rodar({
      terreno: { zona: { codigo: null, atribuicao: "nenhuma", zonasCruzadas: 0 } },
    })
    expect(codigos(r)).toContain("zona_nao_identificada")
  })

  it("comparáveis insuficientes e dispersão alta", () => {
    expect(codigos(rodar({ comparaveis: null }))).toContain("comparaveis_insuficientes")
    const disperso = rodar({
      comparaveis: {
        n: 3,
        medianaM2: 11_000,
        mediaM2: 11_000,
        desvioPadraoM2: 3_300,
        cv: 0.3,
        minM2: 7_000,
        maxM2: 15_000,
      },
    })
    expect(codigos(disperso)).toEqual(
      expect.arrayContaining(["comparaveis_insuficientes", "dispersao_preco_alta"]),
    )
    expect(disperso.risco.nivel).toBe("medio")
  })
})

describe("Etapa G: melhor uso", () => {
  it("ranqueia por TIR ajustada a risco e explica os não elegíveis", () => {
    const vertical = rodar()
    const comercial = calcularViabilidade({
      ...entradaCaso01({ precoVendaM2: 12_500 }),
      regra: { ...entradaCaso01().regra, uso: "comercial" },
    })
    const horizontal = rodar({ regra: { uso: "residencial_horizontal", permitido: false } })
    const incompleto = rodar({ regra: { uso: "misto", caBasico: null } })
    const prejuizo = calcularViabilidade({
      ...entradaCaso01({ precoVendaM2: 3_000 }),
      regra: { ...entradaCaso01().regra, uso: "servicos" },
    })

    const ranking = ranquearUsos([horizontal, vertical, incompleto, prejuizo, comercial])
    expect(ranking.map((c) => c.uso)).toEqual([
      "comercial",
      "residencial_vertical",
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ])
    expect(ranking[0]!.elegivel).toBe(true)
    const lider = ranking[0]!
    expect(lider.indice).toBeCloseTo(lider.tirAnual! * (1 - lider.scoreRisco / 100), 12)
    // O residencial (score 20) é penalizado pelo risco.
    const residencial = ranking[1]!
    expect(residencial.scoreRisco).toBe(20)
    expect(residencial.indice).toBeCloseTo(residencial.tirAnual! * 0.8, 12)
    const motivo = (uso: string) => ranking.find((c) => c.uso === uso)!.motivo
    expect(motivo("residencial_horizontal")).toBe("Uso não permitido na zona.")
    expect(motivo("misto")).toBe("Estudo incompleto (faltam parâmetros).")
    expect(motivo("servicos")).toBe("Resultado negativo no cenário base.")
  })
})

describe("cobertura de camadas", () => {
  it("avisa dados insuficientes quando o município não tem camada de um tipo", () => {
    const entrada = entradaCaso01()
    entrada.terreno.camadasSemCobertura = ["app", "faixa_dominio"]
    const r = calcularViabilidade(entrada)
    expect(r.avisos).toContain(
      'Sem camada oficial de APP e faixa de domínio no município: dados insuficientes, não "sem restrição". Verifique na diligência.',
    )
  })

  it("estudo antigo, sem o campo, não ganha aviso", () => {
    const r = calcularViabilidade(entradaCaso01())
    expect(r.avisos.join(" ")).not.toMatch(/Sem camada oficial/)
  })
})

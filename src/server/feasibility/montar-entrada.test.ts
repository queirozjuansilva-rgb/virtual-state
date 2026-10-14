import { describe, expect, it } from "vitest"

import { calcularViabilidade } from "@/lib/feasibility"

import { montarConfig } from "./config"
import { montarEntrada, type ContextoTerreno, type RegraDb } from "./montar-entrada"

const regraVertical: RegraDb = {
  use_type: "residencial_vertical",
  permitted: true,
  ca_basico: 1.5,
  ca_max: 2.5,
  to_max: 0.6,
  gabarito_m: 48,
  gabarito_pavimentos: 16,
  recuo_frontal: "5",
  recuo_lateral: "max(H / 12, 2.5)",
  recuo_fundos: "max(H / 12, 2.5)",
  lote_minimo_m2: 360,
  testada_minima_m: 12,
  outorga_fator: 0.3,
  rule_sources: [
    {
      field: "ca_basico",
      article: "Anexo II, Tabela ZT-2 (fictício)",
      excerpt: "CA básico 1,5",
      legal_document: { kind: "lei_complementar", number: "999/2026-TESTE", is_fictitious: true },
    },
  ],
}

function contexto(
  over: Partial<ContextoTerreno["terreno"]> = {},
  ctxOver: Partial<ContextoTerreno> = {},
): ContextoTerreno {
  return {
    terreno: {
      id: "t1",
      code: "VE-0004",
      area_m2: 2000,
      area_informada_m2: null,
      testada_principal_m: 40,
      esquina: false,
      declividade_pct: null,
      matricula_numero: "20.002",
      onus: null,
      preco_pedido: 5_500_000,
      negociacao: "dinheiro",
      permuta_pct: null,
      zone_assignment: "automatica",
      zones_overlap_count: 1,
      zone: { id: "z2", code: "ZT-2" },
      uf: "CE",
      tem_app: false,
      tem_area_alagavel: false,
      tem_faixa_dominio: false,
      tem_tombamento: false,
      tem_servidao: false,
      is_fictitious: true,
      ...over,
    },
    regras: [
      regraVertical,
      { ...regraVertical, use_type: "residencial_horizontal", permitted: false },
    ],
    hitsAmbientais: [],
    cubs: { "R8-N": { value_m2: 2458.13, reference_month: "2026-08-01", source: "Sinduscon-CE" } },
    comparaveis: {
      apartamento: [10_000, 11_000, 12_000, 11_500, 10_500].map((p) => ({
        price_m2: p,
        is_fictitious: true,
      })),
    },
    config: montarConfig([], []),
    desde: "2024-10-01",
    ...ctxOver,
  }
}

describe("montarEntrada", () => {
  it("monta a entrada do caso real com fontes", () => {
    const m = montarEntrada(contexto(), { uso: "residencial_vertical" })
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const e = m.entrada
    expect(e.terreno.areaM2).toBe(2000)
    expect(e.terreno.zona).toEqual({ codigo: "ZT-2", atribuicao: "automatica", zonasCruzadas: 1 })
    expect(e.terreno.matriculaInformada).toBe(true)
    expect(e.regra.status).toBe("validado")
    expect(e.regra.fontes.ca_basico).toMatchObject({
      tipo: "lei",
      documento: "Lei complementar nº 999/2026-TESTE",
      ficticio: true,
    })
    expect(e.mercado.precoVendaM2).toBe(11_000)
    expect(e.mercado.fontePreco).toMatchObject({ tipo: "comparaveis", n: 5, raioM: 1500 })
    expect(e.premissas.cubM2).toBe(2458.13)
    expect(e.premissas.formaAquisicao).toBe("compra")
    expect(e.fontes.cubM2).toEqual({
      tipo: "cub",
      uf: "CE",
      padrao: "R8-N",
      mesReferencia: "2026-08",
      origem: "Sinduscon-CE",
    })
    expect(m.avisos).toEqual(
      expect.arrayContaining([
        "Terreno fictício (dados de teste).",
        "Parâmetros urbanísticos de lei fictícia (dados de teste).",
        "Comparáveis fictícios (dados de teste).",
      ]),
    )
    expect(calcularViabilidade(e).status).toBe("ok")
  })

  it("preço informado pelo usuário vence a mediana", () => {
    const m = montarEntrada(contexto(), { uso: "residencial_vertical", precoVendaM2: 13_000 })
    expect(m.ok && m.entrada.mercado.precoVendaM2).toBe(13_000)
    expect(m.ok && m.entrada.mercado.fontePreco.tipo).toBe("premissa_usuario")
  })

  it("sem comparáveis nem preço informado: pendência", () => {
    const m = montarEntrada(contexto({}, { comparaveis: {} }), { uso: "residencial_vertical" })
    expect(m.ok).toBe(false)
    expect(!m.ok && m.pendencias[0]).toContain("Sem comparáveis de apartamento")
  })

  it("CUB do padrão ausente usa R8-N com aviso; sem CUB nenhum, pendência", () => {
    const comercial = montarEntrada(
      contexto({}, { regras: [{ ...regraVertical, use_type: "comercial" }] }),
      { uso: "comercial", precoVendaM2: 12_000 },
    )
    expect(comercial.ok && comercial.entrada.fontes.cubM2).toMatchObject({ padrao: "R8-N" })
    expect(comercial.avisos.join(" ")).toContain("CUB CSL8-N não cadastrado")

    const semCub = montarEntrada(contexto({}, { cubs: {} }), { uso: "residencial_vertical" })
    expect(semCub.ok).toBe(false)
    expect(!semCub.ok && semCub.pendencias).toEqual(["Nenhum CUB cadastrado para CE."])
  })

  it("compra sem preço do terreno: pendência", () => {
    const m = montarEntrada(contexto({ preco_pedido: null }), { uso: "residencial_vertical" })
    expect(!m.ok && m.pendencias).toContain("Informe o preço do terreno.")
  })

  it("permuta física vem do cadastro do terreno", () => {
    const m = montarEntrada(contexto({ negociacao: "permuta_fisica", permuta_pct: 0.18 }), {
      uso: "residencial_vertical",
    })
    expect(m.ok && m.entrada.premissas).toMatchObject({
      formaAquisicao: "permuta_fisica",
      permutaPct: 0.18,
    })
    expect(m.ok && m.entrada.fontes.permutaPct).toEqual({
      tipo: "dado_terreno",
      campo: "permuta_pct",
    })
  })

  it("sem zona: regra ausente; uso proibido vem da regra validada", () => {
    const semZona = montarEntrada(contexto({ zone: null }), { uso: "residencial_vertical" })
    expect(semZona.ok && semZona.entrada.regra.status).toBe("ausente")
    expect(semZona.ok && semZona.entrada.terreno.zona.atribuicao).toBe("nenhuma")

    const proibido = montarEntrada(contexto(), {
      uso: "residencial_horizontal",
      precoVendaM2: 9_000,
    })
    expect(proibido.ok && proibido.entrada.regra.permitido).toBe(false)
  })

  it("restrições: camadas cruzadas e checklist", () => {
    const m = montarEntrada(
      contexto(
        { tem_app: true, tem_servidao: true },
        {
          hitsAmbientais: [
            { kind: "app", name: "APP de teste", overlap_m2: 311.45, is_fictitious: true },
          ],
        },
      ),
      { uso: "residencial_vertical" },
    )
    expect(m.ok && m.entrada.terreno.restricoes).toEqual([
      { tipo: "app", sobreposicaoM2: 311.45, origem: "APP de teste (camada fictícia)" },
      { tipo: "app", sobreposicaoM2: null, origem: "Checklist do cadastro" },
      { tipo: "servidao", sobreposicaoM2: null, origem: "Checklist do cadastro" },
    ])
  })

  it("cobertura de camadas: tipos sem camada no município vão para a entrada", () => {
    const com = montarEntrada(
      contexto({}, { camadasDoMunicipio: ["zona_protecao_ambiental", "area_alagavel", "outro"] }),
      { uso: "residencial_vertical" },
    )
    expect(com.ok && com.entrada.terreno.camadasSemCobertura).toEqual([
      "app",
      "faixa_dominio",
      "tombamento",
    ])
    // Sem a informação (ex.: evals), não avalia a cobertura.
    const sem = montarEntrada(contexto(), { uso: "residencial_vertical" })
    expect(sem.ok && sem.entrada.terreno.camadasSemCobertura).toBeUndefined()
  })

  it("usar CA máximo vira premissa do usuário", () => {
    const m = montarEntrada(contexto(), { uso: "residencial_vertical", usarCaMaximo: true })
    expect(m.ok && m.entrada.premissas.usarCaMaximo).toBe(true)
    expect(m.ok && m.entrada.fontes.usarCaMaximo).toEqual({ tipo: "premissa_usuario" })
  })
})

describe("uso misto", () => {
  it("avisa que é estimado como residencial", () => {
    const m = montarEntrada(contexto({}, { regras: [{ ...regraVertical, use_type: "misto" }] }), {
      uso: "misto",
    })
    expect(m.avisos.join(" ")).toContain("Uso misto estimado como residencial")
  })
})

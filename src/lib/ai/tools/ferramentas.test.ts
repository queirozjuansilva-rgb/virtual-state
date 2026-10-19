import { beforeEach, describe, expect, it } from "vitest"

import { criarDadosFixture } from "../evals/fixture/dados-fixture"
import type {
  ResultadoComparacao,
  ResultadoLocalizacao,
  ResultadoMercado,
  ResultadoParametros,
  ResultadoViabilidadeCopiloto,
  ResultadoZona,
  TerrenoDetalhe,
} from "../tipos"
import { definicoesFerramentas, executarFerramenta, FERRAMENTAS } from "./index"
import { normalizarCodigo } from "./ferramenta"

let dados: ReturnType<typeof criarDadosFixture>

beforeEach(() => {
  dados = criarDadosFixture()
})

async function rodar<T>(nome: string, entrada: unknown) {
  const r = await executarFerramenta(nome, entrada, { dados })
  if (!r.ok) throw new Error(r.erro)
  // Intl separa "R$" do número com espaço não separável; os testes usam espaço comum.
  return JSON.parse(JSON.stringify(r.saida).replace(/\u00a0/g, " ")) as {
    resultado: T
    cartao?: { tipo: string }
    terrenoId?: string
  }
}

async function falhar(nome: string, entrada: unknown) {
  const r = await executarFerramenta(nome, entrada, { dados })
  if (r.ok) throw new Error(`esperava erro em ${nome}`)
  return r.erro
}

describe("definições para a API", () => {
  it("lista as 12 ferramentas em ordem fixa, com JSON Schema sem $schema", () => {
    const defs = definicoesFerramentas()
    expect(defs.map((d) => d.name)).toEqual([
      "buscar_terrenos",
      "obter_terreno",
      "localizar_endereco",
      "identificar_zona",
      "consultar_parametros_urbanisticos",
      "buscar_legislacao",
      "consultar_mercado",
      "calcular_viabilidade",
      "comparar_terrenos",
      "estudar_ponto",
      "gerar_relatorio",
      "solicitar_cobertura",
    ])
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object")
      expect(d.input_schema).not.toHaveProperty("$schema")
      expect(d.eager_input_streaming).toBe(true)
      expect(d.description!.length).toBeGreaterThan(40)
    }
    expect(new Set(FERRAMENTAS.map((f) => f.rotulo)).size).toBe(FERRAMENTAS.length)
  })
})

describe("executarFerramenta", () => {
  it("recusa ferramenta desconhecida e entrada inválida sem lançar", async () => {
    expect(await falhar("apagar_tudo", {})).toMatch(/desconhecida/)
    expect(await falhar("obter_terreno", { terreno: "" })).toMatch(/Entrada inválida/)
    expect(await falhar("comparar_terrenos", { terrenos: ["VE-0001"] })).toMatch(/Entrada inválida/)
  })

  it("normaliza códigos de terreno", () => {
    expect(normalizarCodigo("ve-1")).toBe("VE-0001")
    expect(normalizarCodigo("VE 0008")).toBe("VE-0008")
    expect(normalizarCodigo("ve0010")).toBe("VE-0010")
  })

  it("terreno inexistente vira erro explicativo", async () => {
    expect(await falhar("obter_terreno", { terreno: "VE-9999" })).toMatch(/não encontrado/)
  })
})

describe("consultar_parametros_urbanisticos (aceite da Fase 3)", () => {
  it("recuo frontal do VE-0001: valor com lei e artigo", async () => {
    const { resultado, cartao } = await rodar<ResultadoParametros>(
      "consultar_parametros_urbanisticos",
      { terreno: "VE-0001", uso: "residencial_vertical" },
    )
    expect(resultado.status).toBe("validado")
    expect(resultado.zona?.codigo).toBe("ZT-1")
    const recuo = resultado.regras[0].parametros.find((p) => p.campo === "recuo_frontal")
    expect(recuo?.valor).toBe("5 m")
    expect(recuo?.fonte?.texto).toContain("999/2026-TESTE")
    expect(recuo?.fonte?.texto).toContain("Anexo II, Tabela ZT-1")
    expect(recuo?.fonte?.ficticio).toBe(true)
    expect(cartao?.tipo).toBe("parametros")
  })

  it("recuo por fórmula explica as variáveis", async () => {
    const { resultado } = await rodar<ResultadoParametros>("consultar_parametros_urbanisticos", {
      terreno: "VE-0004",
      uso: "residencial_vertical",
    })
    const lateral = resultado.regras[0].parametros.find((p) => p.campo === "recuo_lateral")
    expect(lateral?.valor).toMatch(/^max\(H\/12, 2\.5\) \(fórmula; H = altura/)
  })

  it("sem uso: todos os usos com regra validada; uso não permitido sem parâmetros", async () => {
    const { resultado } = await rodar<ResultadoParametros>("consultar_parametros_urbanisticos", {
      terreno: "VE-0007",
    })
    expect(resultado.regras.map((r) => r.uso)).toEqual([
      "comercial",
      "misto",
      "residencial_horizontal",
      "residencial_vertical",
    ])
    const comercial = resultado.regras.find((r) => r.uso === "comercial")!
    expect(comercial.permitido).toBe(false)
    expect(comercial.parametros).toEqual([])
  })

  it("uso sem regra validada declara a ausência e os próximos passos", async () => {
    const { resultado } = await rodar<ResultadoParametros>("consultar_parametros_urbanisticos", {
      terreno: "ve-1",
      uso: "servicos",
    })
    expect(resultado.status).toBe("sem_regra_validada")
    expect(resultado.regras).toEqual([])
    expect(resultado.mensagem).toMatch(/não tem regra validada para o uso serviços/)
    expect(resultado.proximos_passos.length).toBeGreaterThan(0)
  })

  it("lote sem zona: sem parâmetro", async () => {
    const { resultado } = await rodar<ResultadoParametros>("consultar_parametros_urbanisticos", {
      terreno: "VE-0010",
    })
    expect(resultado.status).toBe("sem_zona")
  })

  it("ponto no mapa usa a zona que contém o ponto", async () => {
    const { resultado } = await rodar<ResultadoParametros>("consultar_parametros_urbanisticos", {
      longitude: -38.487,
      latitude: -3.755,
      uso: "residencial_vertical",
    })
    expect(resultado.zona?.codigo).toBe("ZT-3")
    expect(resultado.referencia).toBe("ponto -3.75500, -38.48700")
  })

  it("exige terreno ou ponto", async () => {
    expect(await falhar("consultar_parametros_urbanisticos", { uso: "comercial" })).toMatch(
      /Informe `terreno`/,
    )
  })
})

describe("terrenos e zona", () => {
  it("busca por uso permitido e preço, só disponíveis/em negociação", async () => {
    const { resultado } = await rodar<{ terrenos: { codigo: string }[]; filtros: string }>(
      "buscar_terrenos",
      { uso: "residencial_vertical", preco_max: 3_000_000 },
    )
    expect(resultado.terrenos.map((t) => t.codigo)).toEqual([
      "VE-0005",
      "VE-0006",
      "VE-0007",
      "VE-0008",
    ])
    expect(resultado.filtros).toContain("preço ≤ R$ 3.000.000,00")
  })

  it("bairro sem acento e situação reservada", async () => {
    const sem = await rodar<{ terrenos: { codigo: string }[] }>("buscar_terrenos", {
      bairro: "dionisio",
    })
    expect(sem.resultado.terrenos.map((t) => t.codigo)).toEqual(["VE-0007"])
    const com = await rodar<{ terrenos: { codigo: string }[] }>("buscar_terrenos", {
      bairro: "dionisio",
      incluir_indisponiveis: true,
    })
    expect(com.resultado.terrenos.map((t) => t.codigo)).toEqual(["VE-0007", "VE-0009"])
  })

  it("busca vazia não gera cartão", async () => {
    const r = await rodar<{ total_encontrado: number; mensagem: string }>("buscar_terrenos", {
      bairro: "Copacabana",
    })
    expect(r.resultado.total_encontrado).toBe(0)
    expect(r.resultado.mensagem).toMatch(/não invente/)
    expect(r.cartao).toBeUndefined()
  })

  it("ficha do terreno com restrição de APP e foco no painel", async () => {
    const { resultado, terrenoId } = await rodar<TerrenoDetalhe>("obter_terreno", {
      terreno: "ve-8",
    })
    expect(resultado.codigo).toBe("VE-0008")
    expect(resultado.restricoes[0]).toMatchObject({ tipo: "APP" })
    expect(resultado.restricoes[0].descricao).toContain("311,45 m²")
    expect(terrenoId).toBe(resultado.id)
    expect(JSON.stringify(resultado)).not.toMatch(/telefone|e-mail|proprietário:/i)
  })

  it("lote em duas zonas lista as interseções", async () => {
    const { resultado } = await rodar<ResultadoZona>("identificar_zona", { terreno: "VE-0003" })
    expect(resultado.zona?.codigo).toBe("ZT-2")
    expect(resultado.zonas_cruzadas).toEqual([
      { codigo: "ZT-2", percentual_fmt: "55,3%" },
      { codigo: "ZT-1", percentual_fmt: "44,7%" },
    ])
    expect(resultado.mensagem).toMatch(/cruza 2 zonas/)
  })

  it("ponto com APP e ponto fora das zonas", async () => {
    const app = await rodar<ResultadoZona>("identificar_zona", {
      longitude: -38.487,
      latitude: -3.755,
    })
    expect(app.resultado.zona?.codigo).toBe("ZT-3")
    expect(app.resultado.restricoes_ambientais[0].tipo).toBe("APP")
    const fora = await rodar<ResultadoZona>("identificar_zona", {
      longitude: -40.5,
      latitude: -9.39,
    })
    expect(fora.resultado.zona).toBeNull()
    expect(fora.resultado.mensagem).toMatch(/pedido de cobertura/)
  })
})

describe("localizar_endereco", () => {
  it("endereço exato: coordenadas, zona e município", async () => {
    const { resultado, cartao } = await rodar<ResultadoLocalizacao>("localizar_endereco", {
      endereco: "Rua de Teste K, 10, Aldeota, Fortaleza/CE",
    })
    expect(resultado.candidatos).toEqual([
      {
        descricao: "Rua de Teste K, 10 - Aldeota, Fortaleza - CE",
        precisao: "endereço exato",
        exato: true,
        longitude: -38.498,
        latitude: -3.74,
        zona: "ZT-2",
        municipio: "Fortaleza/CE",
      },
    ])
    expect(resultado.aviso).toMatch(/aproximada/)
    expect(cartao?.tipo).toBe("localizacao")
  })

  it("rua sem número pede confirmação", async () => {
    const { resultado } = await rodar<ResultadoLocalizacao>("localizar_endereco", {
      endereco: "rua de teste L, Fortaleza",
    })
    expect(resultado.candidatos[0]).toMatchObject({
      precisao: "rua (sem número)",
      exato: false,
      zona: "ZT-3",
    })
    expect(resultado.aviso).toMatch(/confirme com o usuário/)
  })

  it("endereço não encontrado não gera cartão", async () => {
    const r = await rodar<ResultadoLocalizacao>("localizar_endereco", {
      endereco: "Rua Inexistente, 999",
    })
    expect(r.resultado.candidatos).toEqual([])
    expect(r.resultado.aviso).toMatch(/não encontrado/)
    expect(r.cartao).toBeUndefined()
  })

  it("sem chave da MapTiler: orienta a marcar no mapa", async () => {
    const semGeocoder = { ...dados, geocodificar: async () => null }
    const r = await executarFerramenta(
      "localizar_endereco",
      { endereco: "Rua de Teste K, 10" },
      { dados: semGeocoder },
    )
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/marcar o ponto no mapa/) })
  })
})

describe("mercado", () => {
  it("comparáveis e CUB do VE-0001", async () => {
    const { resultado } = await rodar<ResultadoMercado>("consultar_mercado", { terreno: "VE-0001" })
    expect(resultado.comparaveis).toMatchObject({
      n: 13,
      mediana_m2_fmt: "R$ 12.961,24/m²",
      raio_m: 1500,
      desde_fmt: "12/10/2024",
      baixa_confianca: false,
    })
    expect(resultado.cub).toMatchObject({ padrao: "R8-N", valor_fmt: "R$ 2.458,13/m²" })
  })

  it("amostra pequena e CUB aproximado para comercial", async () => {
    const { resultado } = await rodar<ResultadoMercado>("consultar_mercado", {
      terreno: "VE-0008",
      uso: "comercial",
    })
    expect(resultado.comparaveis?.baixa_confianca).toBe(true)
    expect(resultado.cub?.padrao).toBe("R8-N")
    expect(resultado.avisos.join(" ")).toMatch(/CSL8-N não cadastrado/)
  })

  it("indicadores agregados do bairro e do município, só como contexto", async () => {
    dados.usuarioEhAdmin = async () => true
    const linha = {
      typology: "apartamento" as const,
      period: "2026-06-01",
      source: "CPES Sinduscon-CE, 2º trimestre de 2026",
      internal_only: true,
    }
    dados.indicadoresMercado = async () => [
      {
        ...linha,
        neighborhood: "Meireles",
        avg_price_m2: 20172,
        vso_pct: 0.098,
        stock_units: 508,
        source_page: 44,
      },
      {
        ...linha,
        neighborhood: null,
        avg_price_m2: 11977,
        vso_pct: 0.076,
        stock_units: 10753,
        source_page: 32,
      },
    ]
    const { resultado } = await rodar<ResultadoMercado>("consultar_mercado", { terreno: "VE-0001" })
    expect(resultado.indicadores).toMatchObject({
      periodo_fmt: "jun. de 2026",
      uso_interno: true,
      bairro: {
        nome: "Meireles",
        preco_m2_fmt: "R$ 20.172,00/m²",
        ivv_fmt: "9,8%",
        oferta: 508,
        pagina: 44,
      },
      municipio: { nome: "Fortaleza", oferta: 10753, pagina: 32 },
    })
    expect(resultado.comparaveis?.mediana_m2_fmt).toBe("R$ 12.961,24/m²")
    expect(resultado.avisos.join(" ")).toMatch(/preço médio de tabela \(não de venda\)/)

    // Ponto: o bairro vem da entrada, sem acento nem caixa.
    const ponto = await rodar<ResultadoMercado>("consultar_mercado", {
      longitude: -38.498,
      latitude: -3.74,
      bairro: "MEIRELES ",
    })
    expect(ponto.resultado.indicadores?.bairro?.nome).toBe("Meireles")

    const semBairro = await rodar<ResultadoMercado>("consultar_mercado", {
      longitude: -38.498,
      latitude: -3.74,
      bairro: "Bairro Inexistente",
    })
    expect(semBairro.resultado.indicadores?.bairro).toBeNull()
    expect(semBairro.resultado.avisos.join(" ")).toMatch(
      /Sem indicador para o bairro Bairro Inexistente/,
    )

    // Indicador de apartamento não vale para uso comercial.
    const comercial = await rodar<ResultadoMercado>("consultar_mercado", {
      terreno: "VE-0001",
      uso: "comercial",
    })
    expect(comercial.resultado.indicadores).toBeNull()
  })
})

describe("indicadores do CPES restritos a administradores", () => {
  const linhaCpes = {
    typology: "apartamento" as const,
    period: "2026-06-01",
    source: "CPES Sinduscon-CE, 2º trimestre de 2026",
    internal_only: true,
    neighborhood: null,
    avg_price_m2: 11977,
    vso_pct: 0.076,
    stock_units: 10753,
    source_page: 32,
  }

  it("usuário comum não recebe indicadores, nem se a consulta devolvesse linhas", async () => {
    let consultas = 0
    dados.indicadoresMercado = async () => {
      consultas++
      return [linhaCpes]
    }
    const { resultado } = await rodar<ResultadoMercado>("consultar_mercado", { terreno: "VE-0001" })
    expect(resultado.indicadores).toBeNull()
    expect(consultas).toBe(0)
    expect(JSON.stringify(resultado)).not.toMatch(/CPES|11\.977/)
    // O restante do mercado continua: comparáveis e CUB.
    expect(resultado.comparaveis?.mediana_m2_fmt).toBe("R$ 12.961,24/m²")
    expect(resultado.cub?.padrao).toBe("R8-N")
  })

  it("administrador recebe os indicadores com fonte e página", async () => {
    dados = criarDadosFixture({ admin: true })
    dados.indicadoresMercado = async () => [linhaCpes]
    const { resultado } = await rodar<ResultadoMercado>("consultar_mercado", { terreno: "VE-0001" })
    expect(resultado.indicadores).toMatchObject({
      fonte: "CPES Sinduscon-CE, 2º trimestre de 2026",
      municipio: { nome: "Fortaleza", pagina: 32 },
    })
  })
})

describe("viabilidade", () => {
  it("estuda todos os usos permitidos, ranqueia e registra cada execução", async () => {
    const { resultado, cartao } = await rodar<ResultadoViabilidadeCopiloto>(
      "calcular_viabilidade",
      {
        terreno: "VE-0001",
      },
    )
    expect(resultado.estudos.map((e) => e.uso)).toEqual([
      "comercial",
      "misto",
      "residencial_vertical",
    ])
    expect(resultado.ranking[0]).toMatchObject({ elegivel: true })
    expect(resultado.disclaimer).toMatch(/Estudo preliminar automatizado/)
    expect(dados.registros.analises).toHaveLength(3)
    expect(cartao?.tipo).toBe("viabilidade")
    const base = resultado.estudos.find((e) => e.uso === "residencial_vertical")!.base!
    expect(base.margem_fmt).toMatch(/%$/)
    expect(base.tir_anual_fmt).toMatch(/a\.a\.$/)
  })

  it("um uso só, com preço informado pelo usuário como premissa", async () => {
    const { resultado } = await rodar<ResultadoViabilidadeCopiloto>("calcular_viabilidade", {
      terreno: "VE-0004",
      uso: "residencial_vertical",
      preco_venda_m2: 13000,
    })
    expect(resultado.estudos).toHaveLength(1)
    const preco = resultado.estudos[0].premissas_principais.find((p) =>
      p.rotulo.startsWith("Preço de venda"),
    )
    expect(preco).toMatchObject({
      valor_fmt: "R$ 13.000,00/m²",
      fonte: expect.stringMatching(/Premissa do usuário/),
    })
  })

  it("APP e topografia entram como flags de risco", async () => {
    const { resultado } = await rodar<ResultadoViabilidadeCopiloto>("calcular_viabilidade", {
      terreno: "VE-0008",
      uso: "residencial_vertical",
    })
    const flags = resultado.estudos[0].risco!.flags.map((f) => f.rotulo)
    expect(flags).toContain("Interseção com APP")
  })

  it("lote sem zona não roda", async () => {
    expect(await falhar("calcular_viabilidade", { terreno: "VE-0010" })).toMatch(
      /não tem zona identificada/,
    )
    expect(dados.registros.analises).toHaveLength(0)
  })

  it("compara terrenos, inclusive um sem estudo possível", async () => {
    const { resultado } = await rodar<ResultadoComparacao>("comparar_terrenos", {
      terrenos: ["VE-0001", "VE-0010"],
    })
    expect(resultado.linhas.map((l) => l.codigo)).toEqual(["VE-0001", "VE-0010"])
    expect(resultado.linhas[0].melhor_uso).not.toBeNull()
    expect(resultado.linhas[1]).toMatchObject({ melhor_uso: null, margem_fmt: "—" })
    expect(resultado.linhas[1].observacao).toMatch(/sem a zona/)
  })

  it("estuda um ponto fora do land bank com área e preço informados", async () => {
    const { resultado } = await rodar<ResultadoViabilidadeCopiloto>("estudar_ponto", {
      longitude: -38.498,
      latitude: -3.74,
      area_m2: 1000,
      testada_m: 25,
      preco_terreno: 2_500_000,
      uso: "residencial_vertical",
    })
    expect(resultado.terreno_id).toBeNull()
    expect(resultado.estudos[0].status).toBe("ok")
    expect(dados.registros.analises).toEqual([
      {
        landId: null,
        contexto: {
          referencia: "Ponto -3.74000, -38.49800",
          uso: "residencial_vertical",
          ponto: { longitude: -38.498, latitude: -3.74 },
        },
      },
    ])
  })

  it("ponto sem preço do terreno é recusado pela validação; ponto fora das zonas não roda", async () => {
    expect(
      await falhar("estudar_ponto", { longitude: -38.498, latitude: -3.74, area_m2: 1000 }),
    ).toMatch(/preco_terreno/)
    expect(
      await falhar("estudar_ponto", {
        longitude: -38.53,
        latitude: -3.74,
        area_m2: 1000,
        preco_terreno: 1,
      }),
    ).toMatch(/Nenhuma zona cadastrada/)
  })
})

describe("gerar_relatorio", () => {
  it("cria o relatório do estudo do uso escolhido, com links do relatório e do PDF", async () => {
    const estudo = await rodar<ResultadoViabilidadeCopiloto>("calcular_viabilidade", {
      terreno: "VE-0004",
      uso: "residencial_vertical",
    })
    const runId = estudo.resultado.estudos[0].analysis_run_id!
    const { resultado, cartao } = await rodar<{
      relatorio_id: string
      titulo: string
      url: string
      pdf_url: string
    }>("gerar_relatorio", { analysis_run_id: runId })
    expect(resultado.titulo).toBe("VE-0004 · Residencial vertical")
    expect(resultado.url).toBe(`/relatorios/${resultado.relatorio_id}`)
    expect(resultado.pdf_url).toBe(`/relatorios/${resultado.relatorio_id}/pdf`)
    expect(cartao?.tipo).toBe("relatorio")
  })

  it("estudo inexistente orienta a rodar o estudo antes", async () => {
    expect(
      await falhar("gerar_relatorio", { analysis_run_id: "a0a0a0a0-0000-4000-8000-000000000099" }),
    ).toMatch(/Rode calcular_viabilidade/)
    expect(await falhar("gerar_relatorio", { analysis_run_id: "run-1" })).toMatch(
      /Entrada inválida/,
    )
  })
})

describe("legislação e cobertura", () => {
  it("legislação não indexada é declarada", async () => {
    const { resultado, cartao } = await rodar<{ trechos: unknown[]; aviso: string }>(
      "buscar_legislacao",
      {
        pergunta: "recuo frontal",
        terreno: "VE-0001",
      },
    )
    expect(resultado.trechos).toEqual([])
    expect(resultado.aviso).toMatch(/ainda não foi indexada/)
    expect(cartao).toBeUndefined()
  })

  it("sem pendência jurídica aberta, a busca não traz ressalva de vigência", async () => {
    const { resultado } = await rodar<{ ressalva: string | null }>("buscar_legislacao", {
      pergunta: "recuo frontal",
      terreno: "VE-0001",
    })
    expect(resultado.ressalva).toBeNull()
  })

  it("com pendência jurídica aberta, a busca traz a ressalva e não chama as leis de vigentes", async () => {
    dados = criarDadosFixture({
      pendenciasJuridicas: [
        {
          titulo: "Vigência da LC nº 450/2025 e efeitos da LC nº 461/2026",
          normas: ["Lei complementar nº 62/2009", "Lei complementar nº 236/2017"],
        },
      ],
    })
    const { resultado } = await rodar<{ ressalva: string | null }>("buscar_legislacao", {
      pergunta: "recuo frontal",
      terreno: "VE-0001",
    })
    expect(resultado.ressalva).toBe(
      "Vigência sob análise jurídica (Vigência da LC nº 450/2025 e efeitos da LC nº 461/2026). " +
        "Normas afetadas: Lei complementar nº 62/2009, Lei complementar nº 236/2017 e as normas " +
        "relacionadas a elas. A aplicação dessas normas depende de parecer jurídico ainda não " +
        "emitido; não as trate como vigentes nem como revogadas.",
    )
    const definicao = definicoesFerramentas().find((d) => d.name === "buscar_legislacao")!
    expect(definicao.description).not.toMatch(/leis urbanísticas vigentes/)
    expect(definicao.description).toMatch(/ressalva/)
  })

  it("município desconhecido na busca de legislação", async () => {
    expect(
      await falhar("buscar_legislacao", { pergunta: "gabarito", municipio: "Petrolina" }),
    ).toMatch(/não está cadastrado/)
  })

  it("registra pedido de cobertura com UF normalizada", async () => {
    const { resultado } = await rodar<{ protocolo: string; uf: string }>("solicitar_cobertura", {
      municipio: "Petrolina",
      uf: "pe",
    })
    expect(resultado).toMatchObject({ protocolo: "C0BE7A6E", uf: "PE" })
    expect(dados.registros.coberturas).toEqual([
      { municipio: "Petrolina", uf: "PE", endereco: null },
    ])
  })
})

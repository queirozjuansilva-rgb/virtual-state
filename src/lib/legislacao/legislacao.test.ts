import { describe, expect, it } from "vitest"

import { conflitosDeFonte } from "./conflitos"
import {
  acertoDaExtracao,
  chaveZona,
  montarRascunhos,
  normalizarParametro,
  type SaidaExtracao,
} from "./extracao"
import { fragmentar, LIMITE_CARACTERES, quebrarTextoCorrido, textoParaEmbedding } from "./fragmentar"
import { precisaDeOcr, separarPaginasOcr } from "./ocr"
import { interpretarPaginas, resumirPaginas } from "./paginas"
import { localizarTrecho, trechoEncontrado } from "./trechos"

describe("conferência de trechos", () => {
  const pagina = `Art. 81 - São parâmetros da ZOP 1:
I - índice de aproveitamento básico:3,0;
VII - altura máxima da edifi-
cação: 72m;
VIII- área mínima de lote: 125m 2 ;`

  it("acha o trecho apesar de acentos, espaços e hifenização", () => {
    expect(trechoEncontrado("índice de aproveitamento básico: 3,0", pagina)).toBe(true)
    expect(trechoEncontrado("INDICE DE APROVEITAMENTO BASICO 3,0", pagina)).toBe(true)
    expect(trechoEncontrado("altura máxima da edificação: 72m", pagina)).toBe(true)
  })

  it("aceita reticências entre partes, na ordem", () => {
    expect(
      trechoEncontrado("São parâmetros da ZOP 1: [...] altura máxima da edificação: 72m", pagina),
    ).toBe(true)
    expect(
      trechoEncontrado("altura máxima da edificação [...] São parâmetros da ZOP 1", pagina),
    ).toBe(false)
  })

  it("não aceita trecho inventado nem curto demais", () => {
    expect(trechoEncontrado("índice de aproveitamento básico: 4,0", pagina)).toBe(false)
    expect(trechoEncontrado("ZOP", pagina)).toBe(false)
  })

  it("procura nas páginas vizinhas e através da quebra de página", () => {
    const paginas = new Map([
      [10, "Art. 81 - São parâmetros da ZOP 1:\nI - índice de aproveitamento"],
      [11, "básico: 3,0;\nII - índice de aproveitamento máximo: 3,0;"],
    ])
    expect(localizarTrecho("índice de aproveitamento máximo: 3,0", 10, paginas)).toEqual({
      encontrado: true,
      pagina: 11,
    })
    expect(localizarTrecho("índice de aproveitamento básico: 3,0", 10, paginas).encontrado).toBe(
      true,
    )
    expect(localizarTrecho("taxa de ocupação: 60%", 10, paginas).encontrado).toBe(false)
  })
})

describe("divisão em trechos", () => {
  const paginas = [
    {
      numero: 3,
      texto: `TÍTULO IV
Do Ordenamento Territorial
Seção II
Da Zona de Ocupação Preferencial 1 (ZOP 1)
Art. 79 - A Zona de Ocupação Preferencial 1 caracteriza-se pela disponibilidade de infraestrutura.
Art. 80 - São objetivos da ZOP 1: possibilitar a intensificação do uso.
Art. 81 - São parâmetros da ZOP 1:
I - índice de aproveitamento básico: 3,0;`,
    },
    {
      numero: 4,
      texto: `II - índice de aproveitamento máximo: 3,0;
VII - altura máxima da edificação: 72m.
Art. 82- Serão aplicados na ZOP 1 os instrumentos previstos nesta Lei, conforme o art. 81.`,
    },
  ]

  it("começa cada trecho num artigo e guarda seção e páginas", () => {
    const f = fragmentar(paginas)
    const art81 = f.find((x) => x.conteudo.includes("Art. 81 -"))!
    expect(art81.secao).toBe("Seção II: Da Zona de Ocupação Preferencial 1 (ZOP 1)")
    expect(art81.paginaInicio).toBe(3)
    expect(art81.conteudo).toContain("altura máxima da edificação: 72m")
    // "conforme o art. 81" no meio da frase não abre trecho novo.
    expect(f.filter((x) => x.artigo?.includes("Art. 82"))).toHaveLength(1)
  })

  it("agrupa artigos curtos vizinhos da mesma seção", () => {
    const f = fragmentar(paginas)
    expect(f.map((x) => x.artigo)).toContain("Art. 79 a Art. 82")
    expect(f[0].artigo).toBeNull() // preâmbulo antes do primeiro artigo
  })

  it("parte artigos longos por inciso, sem passar do limite", () => {
    const incisos = Array.from(
      { length: 60 },
      (_, i) => `${"I".repeat((i % 3) + 1)} - inciso ${i} ${"texto ".repeat(12)};`,
    )
    const f = fragmentar([{ numero: 1, texto: `Art. 5º São requisitos:\n${incisos.join("\n")}` }])
    expect(f.length).toBeGreaterThan(1)
    expect(f.every((x) => x.conteudo.length <= LIMITE_CARACTERES)).toBe(true)
    expect(f[0].artigo).toMatch(/^Art\. 5 \(parte 1 de \d+\)$/)
  })

  it("trata anexos por tamanho, com o rótulo do anexo", () => {
    const f = fragmentar([
      { numero: 1, texto: "Art. 1º Esta lei institui o plano." },
      {
        numero: 9,
        texto: "ANEXO 5 - PARÂMETROS URBANOS\nZOP 1 3,0 3,0 60% 72\nZOP 2 2,0 3,0 60% 72",
      },
    ])
    expect(f.at(-1)).toMatchObject({ artigo: "Anexo 5", paginaInicio: 9 })
  })

  it("quebra artigos e seções no meio do texto corrido do Diário Oficial", () => {
    const corrido =
      "V - solução para energia elétrica domiciliar. Art. 18. Não se caracterizam como loteamento as modificações, conforme o art. 5º desta Lei. § 1º - As áreas decorrentes. SEÇÃO II DO DESMEMBRAMENTO Art. 27. Desmembramento é a subdivisão. Seção IV Da Zona de Ocupação Consolidada (ZOC) Art. 87 - A Zona de Ocupação Consolidada caracteriza-se."
    const linhas = quebrarTextoCorrido(corrido).split("\n")
    expect(linhas.map((l) => l.slice(0, 18))).toEqual([
      "V - solução para e",
      "Art. 18. Não se ca",
      "SEÇÃO II DO DESMEM",
      "Art. 27. Desmembra",
      "Seção IV Da Zona d",
      "Art. 87 - A Zona d",
    ])
    const f = fragmentar([{ numero: 335, texto: corrido }])
    expect(f.map((x) => x.artigo)).toEqual([null, "Art. 18", "Art. 27", "Art. 87"])
    expect(f.find((x) => x.artigo === "Art. 87")?.secao).toBe("Seção IV Da Zona de Ocupação Consolidada (ZOC)")
  })

  it("monta o texto do embedding com seção e artigo", () => {
    expect(textoParaEmbedding({ secao: "Seção II", artigo: "Art. 81", conteudo: "texto" })).toBe(
      "Seção II\nArt. 81\ntexto",
    )
  })
})

describe("OCR", () => {
  it("separa as páginas pelo marcador e mapeia para os números reais", () => {
    const saida = "=== PÁGINA 1 ===\nArt. 1º Texto.\n\n=== PÁGINA 2 ===\nArt. 2º Outro.\n"
    const r = separarPaginasOcr(saida, [41, 42, 43])
    expect(r.paginas.get(41)).toBe("Art. 1º Texto.")
    expect(r.paginas.get(42)).toBe("Art. 2º Outro.")
    expect(r.faltando).toEqual([43])
  })

  it("página quase sem texto precisa de OCR", () => {
    expect(precisaDeOcr("  \n FORTALEZA \n")).toBe(true)
    expect(precisaDeOcr("Art. 1º ".repeat(40))).toBe(false)
  })
})

describe("normalização dos valores extraídos", () => {
  const p = (valor_literal: string, valor_normalizado: string | null = null) => ({
    valor_literal,
    valor_normalizado,
  })

  it("taxas viram fração", () => {
    expect(normalizarParametro("to_max", p("60%"))).toEqual({ ok: true, valor: 0.6 })
    expect(normalizarParametro("permeabilidade_min", p("trinta por cento", "30"))).toEqual({
      ok: true,
      valor: 0.3,
    })
    expect(normalizarParametro("to_max", p("0,6"))).toEqual({ ok: true, valor: 0.6 })
    expect(normalizarParametro("to_max", p("160%")).ok).toBe(false)
  })

  it("números em pt-BR e com unidade", () => {
    expect(normalizarParametro("ca_basico", p("3,0"))).toEqual({ ok: true, valor: 3 })
    expect(normalizarParametro("gabarito_m", p("72m"))).toEqual({ ok: true, valor: 72 })
    expect(normalizarParametro("lote_minimo_m2", p("125m 2"))).toEqual({ ok: true, valor: 125 })
    expect(normalizarParametro("lote_minimo_m2", p("1.500 m²"))).toEqual({ ok: true, valor: 1500 })
    expect(normalizarParametro("gabarito_pavimentos", p("2,5")).ok).toBe(false)
    expect(normalizarParametro("ca_max", p("sem limite")).ok).toBe(false)
  })

  it("recuos: número simples ou fórmula na sintaxe do sistema", () => {
    expect(normalizarParametro("recuo_frontal", p("5,00m"))).toEqual({ ok: true, valor: "5" })
    expect(normalizarParametro("recuo_lateral", p("H/10, mínimo de 3m", "max(H/10, 3)"))).toEqual({
      ok: true,
      valor: "max(H / 10, 3)",
    })
    expect(normalizarParametro("recuo_lateral", p("H/10, mínimo de 3m")).ok).toBe(false)
    expect(normalizarParametro("recuo_fundos", p("x", "eval(1)")).ok).toBe(false)
  })
})

describe("rascunhos a partir da extração", () => {
  const saida: SaidaExtracao = {
    zonas: [
      {
        codigo: "ZOP1",
        nome: "Zona de Ocupação Preferencial 1",
        uso_na_lei: null,
        permitido: "nao_informado",
        permitido_fonte: null,
        parametros: [
          {
            campo: "ca_basico",
            valor_literal: "3,0",
            valor_normalizado: "3",
            artigo: "Art. 81, I",
            pagina: 10,
            trecho: "índice de aproveitamento básico: 3,0",
            condicao: null,
          },
          {
            campo: "to_max",
            valor_literal: "60%",
            valor_normalizado: "60",
            artigo: "Art. 81, V",
            pagina: 10,
            trecho: "taxa de ocupação: 60%",
            condicao: null,
          },
          {
            campo: "to_max",
            valor_literal: "50%",
            valor_normalizado: "50",
            artigo: "Art. 90",
            pagina: 12,
            trecho: "taxa de ocupação: 50%",
            condicao: null,
          },
        ],
        observacoes: null,
      },
      {
        codigo: "ZOR",
        nome: "Zona de Ocupação Restrita",
        uso_na_lei: null,
        permitido: "nao_informado",
        permitido_fonte: null,
        parametros: [],
        observacoes: null,
      },
    ],
    observacoes_gerais: [],
  }
  const paginas = new Map([
    [
      10,
      "Art. 81 - São parâmetros da ZOP 1: I - índice de aproveitamento básico:3,0; V - taxa de ocupação: 70%;",
    ],
  ])

  const r = montarRascunhos(saida, {
    usoAlvo: "residencial_vertical",
    documentoId: "doc-1",
    zonas: [{ id: "z-1", code: "ZOP 1" }],
    paginas,
  })

  it("casa a zona pelo código e lista as que não existem", () => {
    expect(chaveZona("ZOP-1")).toBe(chaveZona("zop 1"))
    expect(r.rascunhos).toHaveLength(1)
    expect(r.rascunhos[0].zoneId).toBe("z-1")
    expect(r.zonasNaoCadastradas).toEqual([{ codigo: "ZOR", nome: "Zona de Ocupação Restrita" }])
  })

  it("normaliza valores, guarda a fonte com página e confere o trecho", () => {
    const [z] = r.rascunhos
    expect(z.values).toMatchObject({ use_type: "residencial_vertical", ca_basico: 3, to_max: 0.6 })
    expect(z.extractedValues).toEqual({ ca_basico: 3, to_max: 0.6 })
    const ca = z.sources.find((s) => s.field === "ca_basico")!
    expect(ca).toMatchObject({ page: 10, article: "Art. 81, I", excerpt_verified: true })
    // "taxa de ocupação: 60%" não está na página (lá diz 70%): marcado para conferir.
    expect(z.sources.find((s) => s.field === "to_max")!.excerpt_verified).toBe(false)
    expect(z.avisos.join(" ")).toMatch(/Taxa de ocupação máxima: trecho não localizado/)
    expect(z.avisos.join(" ")).toMatch(/mais de um valor/)
    expect(z.values.permitted).toBeUndefined()
  })

  it("mede o acerto contra a regra homologada", () => {
    expect(
      acertoDaExtracao({ ca_basico: 3, to_max: 0.6 }, { ca_basico: 3.0000001, to_max: 0.7 }),
    ).toEqual({
      campos: 2,
      iguais: 1,
      alterados: ["to_max"],
    })
  })
})

describe("páginas digitadas", () => {
  it("lê intervalos e listas, ordena e remove repetidas", () => {
    expect(interpretarPaginas("79-81, 120 80", 437)).toEqual({
      ok: true,
      paginas: [79, 80, 81, 120],
    })
    expect(resumirPaginas([95, 79, 80, 81])).toBe("79–81, 95")
  })

  it("recusa texto inválido e páginas fora do documento", () => {
    expect(interpretarPaginas("abc", 10).ok).toBe(false)
    expect(interpretarPaginas("5-3", 10).ok).toBe(false)
    expect(interpretarPaginas("9-12", 10)).toEqual({
      ok: false,
      erro: "O documento tem 10 páginas.",
    })
    expect(interpretarPaginas(" ", 10).ok).toBe(false)
  })
})

describe("conflito de fontes na homologação", () => {
  const validada = {
    valores: { ca_basico: 3, to_max: 0.6, gabarito_m: 72 },
    fontes: {
      ca_basico: { legal_document_id: "lc62" },
      to_max: { legal_document_id: "lc62" },
      gabarito_m: { legal_document_id: "lc62" },
    },
  }

  it("só é conflito quando o valor muda e a fonte é outra norma", () => {
    const r = conflitosDeFonte(
      {
        valores: { ca_basico: 3, to_max: 0.5, gabarito_m: 48 },
        fontes: {
          ca_basico: { legal_document_id: "lc236" },
          to_max: { legal_document_id: "lc236" },
          gabarito_m: { legal_document_id: "lc62" },
        },
      },
      validada,
    )
    // ca_basico: mesmo valor; gabarito_m: mesma norma (correção); to_max: conflito.
    expect(r).toEqual([{ campo: "to_max", atual: 0.6, novo: 0.5, documentoAtual: "lc62" }])
  })

  it("sem regra validada não há conflito", () => {
    expect(conflitosDeFonte({ valores: { ca_basico: 2 }, fontes: {} }, null)).toEqual([])
  })
})

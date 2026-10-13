import { describe, expect, it } from "vitest"

import { calcularViabilidade, DISCLAIMER, ENGINE_VERSION } from "@/lib/feasibility"
import { entradaCaso01 } from "@/lib/feasibility/fixtures.test-utils"
import { montarModeloPdf } from "@/lib/relatorio/pdf-modelo"

import { gerarPdfRelatorio, nomeArquivoPdf } from "./gerar"

const entrada = entradaCaso01()
const resultado = calcularViabilidade(entrada)
const dados = {
  titulo: "VE-0004 · Residencial vertical",
  organizacao: "Incorporadora Teste",
  versao: {
    id: "v1",
    versao: 2,
    entrada,
    resultado,
    versaoMotor: ENGINE_VERSION,
    salvaEm: "2026-10-13T14:05:00Z",
  },
  contexto: { referencia: "VE-0004", uso: "residencial_vertical" as const },
  terreno: {
    codigo: "VE-0004",
    endereco: "Rua de Teste D, 800",
    bairro: "Aldeota",
    municipio: "Fortaleza",
    uf: "CE",
    ficticio: true,
  },
}

describe("modelo do PDF (aceite da Fase 4)", () => {
  const modelo = montarModeloPdf({ ...dados, geradoEm: new Date("2026-10-13T15:00:00Z") })

  it("tem identidade, data, versão do relatório e do motor", () => {
    expect(modelo).toMatchObject({
      titulo: "VE-0004 · Residencial vertical",
      organizacao: "Incorporadora Teste",
      versao: 2,
      versaoMotor: ENGINE_VERSION,
      geradoEm: "13/10/2026, 12:00",
      ficticio: true,
    })
    expect(modelo.local).toContain("Rua de Teste D, 800")
  })

  it("traz todas as premissas com a origem e o disclaimer", () => {
    expect(modelo.premissas).toHaveLength(resultado.premissas.length)
    for (const p of modelo.premissas) {
      expect(p.valor).not.toBe("")
      expect(p.fonte.length).toBeGreaterThan(3)
    }
    expect(modelo.premissas.find((p) => p.rotulo.startsWith("CUB"))?.fonte).toMatch(/CUB R8-N\/CE/)
    expect(modelo.disclaimer).toBe(DISCLAIMER)
  })

  it("traz parâmetros urbanísticos com lei e artigo, cenários e risco", () => {
    expect(modelo.urbanistico.validado).toBe(true)
    const caBasico = modelo.urbanistico.parametros.find((p) => p.campo === "ca_basico")
    expect(caBasico).toMatchObject({ valor: "1,5" })
    expect(caBasico?.fonte).toMatch(/Lei Complementar nº 999\/2026-TESTE, Anexo II, Tabela ZT-2/)
    // Campo sem fonte vinculada aparece assim mesmo (o PDF escreve "sem fonte vinculada").
    expect(modelo.urbanistico.parametros.find((p) => p.campo === "recuo_frontal")).toMatchObject({
      valor: "5 m",
      fonte: null,
    })
    expect(modelo.cenarios.map((c) => c.indicador)).toContain("Margem líquida")
    expect(modelo.resumo.map((r) => r.rotulo)).toEqual([
      "Margem líquida",
      "ROI",
      "TIR anual",
      "Payback",
      "VGV",
      "Lucro",
      "Custo total",
      "Exposição máxima",
    ])
    expect(modelo.fluxo.length).toBeGreaterThan(12)
  })
})

describe("geração do PDF", () => {
  it("gera um PDF válido", async () => {
    const pdf = await gerarPdfRelatorio(dados)
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(pdf.length).toBeGreaterThan(5_000)
  }, 30_000)

  it("nome do arquivo sem acentos e com a versão", () => {
    expect(nomeArquivoPdf("VE-0004 · Residencial vertical", 2)).toBe(
      "ve-0004-residencial-vertical-v2.pdf",
    )
  })
})

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { recortarPaginas } from "./pdf"
import { transcreverPaginas } from "./modelo"

/**
 * Conferência manual do OCR com o modelo real (npm run evals). Precisa de
 * LEI_PDF apontando para um PDF escaneado (ex.: LC 62/2009 de Fortaleza, SAPL)
 * e de LEI_PAGINAS ("1-4"). Sem essas variáveis, é ignorado.
 */
const pdfPath = process.env.LEI_PDF
const intervalo = process.env.LEI_PAGINAS ?? "1-4"

describe.skipIf(!pdfPath)("OCR com o modelo real", () => {
  it("recorta só as imagens das páginas e transcreve com marcadores", async () => {
    const bytes = new Uint8Array(await readFile(path.resolve(pdfPath!)))
    const [de, ate] = intervalo.split("-").map(Number)
    const paginas = Array.from({ length: ate - de + 1 }, (_, i) => de + i)

    const recorte = await recortarPaginas(bytes, paginas)
    const kb = (recorte.length / 1024).toFixed(0)
    expect(recorte.length).toBeLessThan(paginas.length * 2 * 1024 * 1024)

    const t0 = Date.now()
    const r = await transcreverPaginas(bytes, paginas)
    const resumo = `recorte: ${kb} KB · OCR: ${Date.now() - t0} ms, ${r.uso.entrada} → ${r.uso.saida} tokens, US$ ${r.uso.custoUsd}`
    if (process.env.LEI_SAIDA) await writeFile(`${process.env.LEI_SAIDA}.resumo`, resumo)
    const relatorio = [...r.paginas].map(
      ([p, texto]) => `--- página ${p} (${texto.length} caracteres)\n${texto}`,
    )
    if (process.env.LEI_SAIDA) await writeFile(process.env.LEI_SAIDA, relatorio.join("\n\n"))
    expect(r.faltando).toEqual([])
  })
})

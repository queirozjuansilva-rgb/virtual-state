/**
 * OCR de páginas escaneadas (ADR 0011). O modelo recebe um recorte do PDF e
 * transcreve cada página precedida de um marcador; aqui o texto é separado de
 * volta por página. As páginas do recorte são numeradas a partir de 1 e
 * mapeadas para os números reais do documento.
 */

export const marcadorPagina = (n: number) => `=== PÁGINA ${n} ===`

const MARCADOR = /^\s*=+\s*P[ÁA]GINA\s+(\d+)\s*=+\s*$/gim

export function separarPaginasOcr(
  saida: string,
  paginasDoRecorte: readonly number[],
): { paginas: Map<number, string>; faltando: number[] } {
  const marcas = [...saida.matchAll(MARCADOR)]
  const paginas = new Map<number, string>()
  marcas.forEach((m, i) => {
    const relativa = Number(m[1])
    const real = paginasDoRecorte[relativa - 1]
    if (real === undefined || paginas.has(real)) return
    const inicio = m.index! + m[0].length
    const fim = marcas[i + 1]?.index ?? saida.length
    paginas.set(real, saida.slice(inicio, fim).trim())
  })
  const faltando = paginasDoRecorte.filter((p) => !paginas.has(p))
  return { paginas, faltando }
}

/** Página com menos que isso de texto extraível é tratada como escaneada. */
export const MINIMO_CARACTERES_TEXTO = 200

export function precisaDeOcr(texto: string): boolean {
  return texto.replace(/\s+/g, "").length < MINIMO_CARACTERES_TEXTO
}

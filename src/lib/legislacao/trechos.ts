/**
 * Conferência de trechos citados (ADR 0011). A extração assistida devolve,
 * para cada parâmetro, o trecho literal da lei e a página. Antes de virar
 * rascunho, o trecho é procurado no texto daquela página: se não aparece, o
 * campo vem marcado "conferir no PDF". Comparação tolerante a acentos, caixa,
 * espaços, hifenização de fim de linha e "m 2" × "m²" (comuns em OCR e PDF).
 */

const RETICENCIAS = /\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|\.\.\.|…)\s*/

export function normalizarParaComparar(texto: string): string {
  return (
    texto
      // "edifi-\ncação" → "edificação" (hífen de quebra de linha)
      .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[º°]/g, "o")
      .replace(/[“”«»"]/g, "")
      .replace(/[‘’`']/g, "")
      .replace(/[‐‑‒–—―]/g, "-")
      // Pontuação e espaços variam entre PDF, OCR e a citação; letras e dígitos não.
      .replace(/[^\p{L}\p{N}]/gu, "")
  )
}

/**
 * O trecho está no texto? Reticências ("...", "[...]") separam partes que
 * precisam aparecer em ordem. Partes muito curtas são ignoradas (não provam nada).
 */
export function trechoEncontrado(trecho: string, texto: string): boolean {
  const alvo = normalizarParaComparar(texto)
  const partes = trecho
    .split(RETICENCIAS)
    .map(normalizarParaComparar)
    .filter((p) => p.length >= 6)
  if (partes.length === 0) return false
  let desde = 0
  for (const parte of partes) {
    const i = alvo.indexOf(parte, desde)
    if (i < 0) return false
    desde = i + parte.length
  }
  return true
}

/** Procura o trecho na página indicada e, se não achar, nas vizinhas (±1). */
export function localizarTrecho(
  trecho: string,
  pagina: number,
  paginas: ReadonlyMap<number, string>,
): { encontrado: boolean; pagina: number } {
  for (const p of [pagina, pagina - 1, pagina + 1]) {
    const texto = paginas.get(p)
    if (texto && trechoEncontrado(trecho, texto)) return { encontrado: true, pagina: p }
  }
  // Trecho que atravessa a quebra de página.
  const juntas = [pagina - 1, pagina, pagina + 1].map((p) => paginas.get(p) ?? "").join("\n")
  if (trechoEncontrado(trecho, juntas)) return { encontrado: true, pagina }
  return { encontrado: false, pagina }
}

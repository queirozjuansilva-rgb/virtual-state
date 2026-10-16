/**
 * Lê uma lista de páginas digitada pelo admin: "79-95, 120" → [79, ..., 95, 120].
 * Ordena, remove repetidas e confere o limite do documento.
 */
export function interpretarPaginas(
  texto: string,
  totalPaginas: number,
): { ok: true; paginas: number[] } | { ok: false; erro: string } {
  const paginas = new Set<number>()
  for (const parte of texto.split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)(?:[-–](\d+))?$/)
    if (!m) return { ok: false, erro: `Não entendi "${parte}". Use, por exemplo, 79-95, 120.` }
    const de = Number(m[1])
    const ate = m[2] ? Number(m[2]) : de
    if (de < 1 || ate < de) return { ok: false, erro: `Intervalo inválido: "${parte}".` }
    if (totalPaginas > 0 && ate > totalPaginas) {
      return { ok: false, erro: `O documento tem ${totalPaginas} páginas.` }
    }
    if (ate - de > 2000) return { ok: false, erro: "Intervalo grande demais." }
    for (let p = de; p <= ate; p++) paginas.add(p)
  }
  if (paginas.size === 0) return { ok: false, erro: "Informe as páginas." }
  return { ok: true, paginas: [...paginas].sort((a, b) => a - b) }
}

/** [79, 80, 81, 95] → "79–81, 95" (para exibir). */
export function resumirPaginas(paginas: readonly number[]): string {
  const ordenadas = [...new Set(paginas)].sort((a, b) => a - b)
  const partes: string[] = []
  for (let i = 0; i < ordenadas.length; i++) {
    const de = ordenadas[i]
    while (i + 1 < ordenadas.length && ordenadas[i + 1] === ordenadas[i] + 1) i++
    partes.push(de === ordenadas[i] ? String(de) : `${de}–${ordenadas[i]}`)
  }
  return partes.join(", ")
}

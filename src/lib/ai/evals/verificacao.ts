/**
 * Verificações automáticas dos evals do copiloto. A principal: todo número
 * relevante da resposta precisa ter vindo de uma ferramenta, da pergunta ou do
 * contexto (o LLM não calcula nem inventa números).
 */

const SUFIXOS: Record<string, number> = {
  mil: 1e3,
  milhao: 1e6,
  milhoes: 1e6,
  mi: 1e6,
  bi: 1e9,
  bilhao: 1e9,
  bilhoes: 1e9,
}

const NUMERO =
  /(R\$\s?)?(?<![\p{L}\d.,/-])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(mil|milh(?:ão|ões|ao|oes)|mi|bi(?:lh(?:ão|ões|ao|oes))?)\b)?(\s*(?:%|m²|m2|m\b|metros|meses|pavimentos|anos))?/giu

export type NumeroEncontrado = { texto: string; valor: number; relevante: boolean }

function semAcento(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/** Números escritos em pt-BR ("R$ 4,2 milhões", "12.961,24", "60%"). */
export function extrairNumeros(texto: string): NumeroEncontrado[] {
  const limpo = texto.replace(/\u00a0/g, " ")
  const encontrados: NumeroEncontrado[] = []
  for (const m of limpo.matchAll(NUMERO)) {
    const [inteiro, decimal, sufixo, unidade] = [m[2], m[3], m[4], m[5]]
    let valor = Number(`${inteiro.replace(/\./g, "")}${decimal ? `.${decimal}` : ""}`)
    if (sufixo) valor *= SUFIXOS[semAcento(sufixo)] ?? 1
    const relevante =
      Boolean(m[1] || decimal || sufixo || unidade) || inteiro.includes(".") || valor >= 10
    encontrados.push({ texto: m[0].trim(), valor, relevante })
  }
  return encontrados
}

/** Todos os números de um valor JSON: os crus e os escritos dentro dos textos. */
export function numerosDeJson(valor: unknown): number[] {
  const saida: number[] = []
  const visitar = (v: unknown) => {
    if (typeof v === "number") saida.push(v)
    else if (typeof v === "string") saida.push(...extrairNumeros(v).map((n) => n.valor))
    else if (Array.isArray(v)) v.forEach(visitar)
    else if (v && typeof v === "object") Object.values(v).forEach(visitar)
  }
  visitar(valor)
  return saida
}

/** Aceita arredondamento de até 1% (ex.: "R$ 4,2 milhões" para 4.200.000). */
function corresponde(valor: number, fontes: number[]) {
  return fontes.some((f) => {
    if (f === valor) return true
    // Frações cruas (0,6) aparecem como porcentagem (60%).
    for (const candidato of [f, f * 100]) {
      const base = Math.max(Math.abs(candidato), 1e-9)
      if (Math.abs(candidato - valor) / base <= 0.01) return true
    }
    return false
  })
}

/** Números relevantes da resposta que não aparecem em nenhuma fonte. */
export function numerosSemOrigem(resposta: string, fontes: unknown[]): string[] {
  const permitidos = fontes.flatMap(numerosDeJson)
  return extrairNumeros(resposta)
    .filter((n) => n.relevante && !corresponde(n.valor, permitidos))
    .map((n) => n.texto)
}

export function normalizarResposta(texto: string) {
  return texto.replace(/\u00a0/g, " ")
}

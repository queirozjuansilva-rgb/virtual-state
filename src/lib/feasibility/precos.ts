import type { EstatisticaComparaveis } from "./types"

/**
 * Módulo 3: estatística dos comparáveis (R$/m² privativo). A seleção por raio,
 * tipologia e janela de data acontece no banco (PostGIS); aqui só o cálculo.
 * O preço sugerido é a mediana, menos sensível a anúncios fora da curva.
 */
export function estatisticaComparaveis(precosM2: readonly number[]): EstatisticaComparaveis | null {
  const valores = precosM2.filter((v) => Number.isFinite(v) && v > 0)
  const n = valores.length
  if (n === 0) return null

  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(n / 2)
  const mediana = n % 2 === 1 ? ordenados[meio]! : (ordenados[meio - 1]! + ordenados[meio]!) / 2
  const media = valores.reduce((a, b) => a + b, 0) / n
  // Desvio padrão amostral (n − 1).
  const variancia = n > 1 ? valores.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1) : 0
  const desvio = Math.sqrt(variancia)

  return {
    n,
    medianaM2: mediana,
    mediaM2: media,
    desvioPadraoM2: desvio,
    cv: media > 0 ? desvio / media : 0,
    minM2: ordenados[0]!,
    maxM2: ordenados[n - 1]!,
  }
}

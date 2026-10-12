/** Métricas de fluxo de caixa (ADR 0007). Funções puras e determinísticas. */

const TOL = 1e-9

/** Valor presente líquido de um fluxo mensal a uma taxa mensal. */
export function vpl(fluxo: readonly number[], taxa: number): number {
  let total = 0
  let desconto = 1
  for (const valor of fluxo) {
    total += valor / desconto
    desconto *= 1 + taxa
  }
  return total
}

/**
 * Taxa interna de retorno mensal. Varre taxas de -90% a +100% ao mês até
 * achar a primeira troca de sinal do VPL e refina por bisseção. Retorna null
 * se o fluxo não tem entrada e saída ou se não há raiz no intervalo.
 */
export function tir(fluxo: readonly number[]): number | null {
  const temNegativo = fluxo.some((v) => v < -TOL)
  const temPositivo = fluxo.some((v) => v > TOL)
  if (!temNegativo || !temPositivo) return null

  const PASSO = 0.005
  let a = -0.9
  let va = vpl(fluxo, a)
  for (let b = a + PASSO; b <= 1 + TOL; b += PASSO) {
    const vb = vpl(fluxo, b)
    if (Math.abs(vb) < TOL) return b
    if (Math.sign(va) !== Math.sign(vb)) return bissecao(fluxo, a, b, va)
    a = b
    va = vb
  }
  return null
}

function bissecao(fluxo: readonly number[], a: number, b: number, va: number): number {
  let lo = a
  let hi = b
  let vlo = va
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const vmid = vpl(fluxo, mid)
    if (Math.abs(vmid) < TOL || hi - lo < 1e-12) return mid
    if (Math.sign(vmid) === Math.sign(vlo)) {
      lo = mid
      vlo = vmid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

/** Converte taxa mensal em anual equivalente. */
export function anualizar(taxaMensal: number | null): number | null {
  return taxaMensal === null ? null : Math.pow(1 + taxaMensal, 12) - 1
}

/**
 * Payback simples (nominal): mês a partir do qual o caixa acumulado fica ≥ 0
 * até o fim. 0 se nunca fica negativo; null se termina negativo.
 */
export function payback(acumulado: readonly number[]): number | null {
  let ultimoNegativo = -1
  for (let i = 0; i < acumulado.length; i++) {
    if (acumulado[i]! < -TOL) ultimoNegativo = i
  }
  if (ultimoNegativo === -1) return 0
  if (ultimoNegativo === acumulado.length - 1) return null
  return ultimoNegativo + 1
}

/** Exposição máxima de caixa: módulo do menor acumulado (0 se nunca negativo). */
export function exposicaoMaxima(acumulado: readonly number[]): number {
  return Math.max(0, -Math.min(0, ...acumulado))
}

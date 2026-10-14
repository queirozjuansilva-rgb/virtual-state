/** Formatação e leitura de números no padrão brasileiro (R$, m², %). */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatBRL(value: number | null | undefined, opts?: { compact?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return (opts?.compact ? brlCompact : brl).format(value)
}

export function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatArea(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatNumber(value, 2)} m²`
}

export function formatMeters(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatNumber(value, 2)} m`
}

/** Fração (0–1) como porcentagem: 0.6 → "60%". */
export function formatPercent(value: number | null | undefined, fractionDigits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

const monthYear = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

/** "2026-08-01" → "ago. de 2026" (datas de referência mensais, em UTC). */
export function formatMonthYear(isoDate: string) {
  return monthYear.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })

export function formatDate(isoDate: string | null | undefined) {
  return isoDate ? dateFmt.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)) : "—"
}

/**
 * Lê número digitado em pt-BR ou com ponto decimal:
 * "1.200,50" → 1200.5 · "1200,5" → 1200.5 · "1200.5" → 1200.5 · "1.200" → 1200.
 * Retorna null para vazio e NaN para texto inválido.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  const raw = (input ?? "").trim().replace(/\s|R\$|m²|%/g, "")
  if (raw === "") return null
  if (!/^-?[\d.,]+$/.test(raw)) return Number.NaN

  const lastComma = raw.lastIndexOf(",")
  const lastDot = raw.lastIndexOf(".")
  let normalized: string
  if (lastComma > -1 && lastDot > -1) {
    // O separador que aparece por último é o decimal.
    normalized =
      lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
  } else if (lastComma > -1) {
    if ((raw.match(/,/g) ?? []).length > 1) return Number.NaN
    normalized = raw.replace(",", ".")
  } else if ((raw.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(raw)) {
    // "1.200.000" ou "1.200": pontos de milhar.
    normalized = raw.replace(/\./g, "")
  } else {
    normalized = raw
  }
  const value = Number(normalized)
  return Number.isFinite(value) ? value : Number.NaN
}

/** Valor para preencher um input numérico em pt-BR: 1200.5 → "1200,5". */
export function toInputNumber(value: number | string | null | undefined, scale = 1): string {
  if (value === null || value === undefined || value === "") return ""
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return ""
  return String(Math.round(n * scale * 1e6) / 1e6).replace(".", ",")
}

/** Custo de API em dólar, como mostrado ao admin: 5.6 → "US$ 5,60". */
export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

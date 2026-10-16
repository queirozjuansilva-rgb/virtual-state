/**
 * Datas e horários exibidos na plataforma, sempre no horário de Fortaleza.
 *
 * Dois tipos de valor chegam aqui:
 * - **data civil** ("2026-08-01": colunas `date`, mês do CUB, vigência de lei).
 *   Não tem fuso; é exibida como está, sem deslocar o dia;
 * - **instante** (timestamp ISO, `Date` ou milissegundos): é convertido para
 *   America/Fortaleza. Uma versão salva às 01:30 UTC aparece no dia anterior,
 *   às 22:30.
 *
 * O banco guarda instantes em UTC (`timestamptz`); nada aqui altera o que é gravado.
 */

export const FUSO_HORARIO = "America/Fortaleza"

export type Instante = string | number | Date

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/

const dataCivil = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_HORARIO })
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: FUSO_HORARIO,
})
const mesAno = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const isoLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_HORARIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function paraDate(valor: Instante): Date | null {
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

function dataCivilUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/** "2026-02-01" → "01/02/2026"; instante → dia em Fortaleza. */
export function formatDate(valor: Instante | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  if (typeof valor === "string" && DATA_CIVIL.test(valor)) {
    return dataCivil.format(dataCivilUtc(valor))
  }
  const d = paraDate(valor)
  return d ? data.format(d) : "—"
}

/** Instante → "14/10/2026, 15:42" (horário de Fortaleza). */
export function formatDateTime(valor: Instante | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  const d = paraDate(valor)
  return d ? dataHora.format(d) : "—"
}

/** "2026-08-01" → "ago. de 2026" (meses de referência são datas civis). */
export function formatMonthYear(isoDate: string): string {
  return mesAno.format(dataCivilUtc(isoDate.slice(0, 10)))
}

/** Data de hoje (ISO "2026-10-14") em Fortaleza, não em UTC. */
export function hojeISO(agora: Instante = new Date()): string {
  const d = paraDate(agora)
  if (!d) throw new Error("Instante inválido.")
  return isoLocal.format(d)
}

/** Data civil ISO deslocada em meses: ("2026-10-14", -24) → "2024-10-14". */
export function somarMeses(isoDate: string, meses: number): string {
  const [ano, mes, dia] = isoDate.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1 + meses, dia)).toISOString().slice(0, 10)
}

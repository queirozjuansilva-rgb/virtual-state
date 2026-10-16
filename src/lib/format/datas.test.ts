import { describe, expect, it } from "vitest"

import { formatDate, formatDateTime, formatMonthYear, hojeISO, somarMeses } from "./datas"

// 01:30 UTC de 14/10 ainda é 13/10, 22:30, em Fortaleza (UTC−3, sem horário de verão).
const MADRUGADA_UTC = "2026-10-14T01:30:00Z"

describe("datas no horário de Fortaleza", () => {
  it("instante vira data e hora de Fortaleza, não UTC nem fuso da máquina", () => {
    expect(formatDateTime(MADRUGADA_UTC)).toBe("13/10/2026, 22:30")
    expect(formatDateTime("2026-10-14T01:30:00+00:00")).toBe("13/10/2026, 22:30")
    expect(formatDateTime(new Date(MADRUGADA_UTC))).toBe("13/10/2026, 22:30")
    expect(formatDateTime(Date.parse(MADRUGADA_UTC))).toBe("13/10/2026, 22:30")
    expect(formatDate(MADRUGADA_UTC)).toBe("13/10/2026")
  })

  it("data civil não desloca o dia", () => {
    expect(formatDate("2026-02-01")).toBe("01/02/2026")
    expect(formatDate("2026-12-31")).toBe("31/12/2026")
    expect(formatMonthYear("2026-08-01")).toBe("ago. de 2026")
    expect(formatMonthYear("2026-01-01T00:00:00Z")).toBe("jan. de 2026")
  })

  it("vazio ou inválido vira travessão", () => {
    expect(formatDate(null)).toBe("—")
    expect(formatDate("")).toBe("—")
    expect(formatDate("não é data")).toBe("—")
    expect(formatDateTime(undefined)).toBe("—")
    expect(formatDateTime("2026-13-45T99:00:00Z")).toBe("—")
  })

  it("hoje é a data em Fortaleza", () => {
    expect(hojeISO(new Date("2026-10-15T02:59:00Z"))).toBe("2026-10-14")
    expect(hojeISO(new Date("2026-10-15T03:00:00Z"))).toBe("2026-10-15")
    expect(hojeISO("2027-01-01T01:00:00Z")).toBe("2026-12-31")
  })

  it("soma meses em data civil", () => {
    expect(somarMeses("2026-10-14", -24)).toBe("2024-10-14")
    expect(somarMeses("2026-01-15", -1)).toBe("2025-12-15")
    expect(somarMeses("2026-10-14", 3)).toBe("2027-01-14")
  })
})

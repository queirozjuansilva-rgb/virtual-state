import { describe, expect, it } from "vitest"

import { calcularViabilidade, type MesFluxo } from "@/lib/feasibility"
import { entradaCaso01 } from "@/lib/feasibility/fixtures.test-utils"
import { formatBRL } from "@/lib/format"

import { extensaoRotulo, layoutFluxo, type LayoutFluxo, type OpcoesLayout } from "./grafico"

/** Fluxo sintético a partir do acumulado mês a mês. */
function fluxoDe(acumulados: number[]): MesFluxo[] {
  return acumulados.map((acumulado, mes) => ({
    mes,
    entradas: 0,
    saidas: 0,
    saldo: 0,
    acumulado,
  }))
}

const FLUXOS: Record<string, MesFluxo[]> = {
  caso01: calcularViabilidade(entradaCaso01()).base!.fluxo,
  // Exposição máxima no último mês: o rótulo encosta na borda direita.
  "exposição no fim": fluxoDe(Array.from({ length: 37 }, (_, m) => -m * 1_250_000)),
  // Dez anos (rótulos "Ano N"), exposição no 2º mês e payback no 3º: tudo na esquerda.
  "dez anos": fluxoDe(
    Array.from({ length: 121 }, (_, m) => (m === 0 ? 0 : m <= 2 ? -m * 9_000_000 : m * 400_000)),
  ),
  // Valores pequenos e negativos grandes no eixo Y.
  "valores longos": fluxoDe(
    Array.from({ length: 25 }, (_, m) => -123_456_789 + m * 9_000_000 * (m % 2 ? 1 : 0.5)),
  ),
}

const TELA: Omit<OpcoesLayout, "fonte"> = {
  rotuloValor: (v) => formatBRL(v, { compact: true }),
  rotulosExposicao: (m) => {
    const valor = formatBRL(-m.acumulado, { compact: true })
    return [
      `Exposição máx. ${valor} (mês ${m.mes})`,
      `Exposição máx. ${valor}`,
      `Exp. máx. ${valor}`,
    ]
  },
  rotuloPayback: (mes) => `Payback: mês ${mes}`,
  margens: { esquerda: 48 },
}

function todosOsRotulos(l: LayoutFluxo) {
  return [
    ...l.rotulosY,
    ...l.rotulosX,
    ...(l.rotuloExposicao ? [l.rotuloExposicao] : []),
    ...(l.rotuloPayback ? [l.rotuloPayback] : []),
  ]
}

function conferirQueCabe(l: LayoutFluxo) {
  for (const r of todosOsRotulos(l)) {
    const { esquerda, direita } = extensaoRotulo(r, l.fonte)
    expect(esquerda, `"${r.texto}" sai pela esquerda`).toBeGreaterThanOrEqual(0)
    expect(direita, `"${r.texto}" sai pela direita`).toBeLessThanOrEqual(l.largura)
    expect(r.y - l.fonte, `"${r.texto}" sai por cima`).toBeGreaterThanOrEqual(-l.fonte / 2)
    expect(r.y, `"${r.texto}" sai por baixo`).toBeLessThanOrEqual(l.altura)
  }
  // Valores do eixo Y ficam na margem, sem invadir o gráfico.
  for (const r of l.rotulosY) {
    expect(extensaoRotulo(r, l.fonte).direita).toBeLessThanOrEqual(l.margens.esquerda)
  }
  // Meses do eixo X não se sobrepõem.
  const x = l.rotulosX.map((r) => extensaoRotulo(r, l.fonte))
  for (let i = 1; i < x.length; i++) expect(x[i].esquerda).toBeGreaterThan(x[i - 1].direita)
  // Exposição máxima dentro da área do gráfico.
  if (l.rotuloExposicao) {
    const e = extensaoRotulo(l.rotuloExposicao, l.fonte)
    expect(e.esquerda).toBeGreaterThanOrEqual(l.margens.esquerda)
    expect(l.rotuloExposicao.y).toBeLessThanOrEqual(l.altura - l.margens.base)
  }
}

describe("rótulos do gráfico cabem inteiros", () => {
  for (const [nome, fluxo] of Object.entries(FLUXOS)) {
    for (const largura of [280, 320, 375, 480, 720, 1100]) {
      it(`${nome}, tela de ${largura}px`, () => {
        const l = layoutFluxo(fluxo, largura, largura < 480 ? 220 : 260, { fonte: 11, ...TELA })
        conferirQueCabe(l)
        if (l.minimo) expect(l.rotuloExposicao).not.toBeNull()
        if (l.payback) expect(l.rotuloPayback).not.toBeNull()
      })
    }

    it(`${nome}, PDF`, () => {
      const l = layoutFluxo(fluxo, 515, 170, {
        fonte: 6.5,
        rotuloValor: TELA.rotuloValor,
        margens: { topo: 8, direita: 8, base: 18, esquerda: 40 },
      })
      conferirQueCabe(l)
    })
  }

  it("o último 'Ano N' na borda direita fica alinhado pelo fim", () => {
    const l = layoutFluxo(FLUXOS["dez anos"], 720, 260, { fonte: 11, ...TELA })
    const ultimo = l.rotulosX.at(-1)!
    expect(ultimo.texto).toBe("Ano 10")
    expect(ultimo.ancora).toBe("end")
  })

  it("exposição no fim troca de lado e, na tela estreita, encurta", () => {
    const larga = layoutFluxo(FLUXOS["exposição no fim"], 720, 260, { fonte: 11, ...TELA })
    expect(larga.rotuloExposicao).toMatchObject({ ancora: "end" })
    expect(larga.rotuloExposicao!.texto).toMatch(/\(mês 36\)$/)

    const estreita = layoutFluxo(FLUXOS["exposição no fim"], 280, 220, { fonte: 11, ...TELA })
    expect(estreita.rotuloExposicao!.texto).not.toMatch(/\(mês 36\)/)
  })

  it("dez anos no celular: os anos são espaçados em vez de se sobreporem", () => {
    const l = layoutFluxo(FLUXOS["dez anos"], 320, 220, { fonte: 11, ...TELA })
    expect(l.ticksX).toHaveLength(11)
    expect(l.rotulosX.length).toBeLessThan(11)
    expect(l.rotulosX[0].texto).toBe("Ano 0")
  })
})

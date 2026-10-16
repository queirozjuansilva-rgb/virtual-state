"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"

import type { MesFluxo } from "@/lib/feasibility"
import { formatBRL } from "@/lib/format"
import { layoutFluxo } from "@/lib/relatorio/grafico"

/** Largura antes de medir a tela (render do servidor) e mínimo aceito. */
const LARGURA_INICIAL = 720
const LARGURA_MINIMA = 280
const FONTE = 11

/**
 * Fluxo de caixa acumulado do cenário base, com exposição máxima e payback.
 * O desenho usa a largura real do contêiner (em vez de encolher um SVG fixo),
 * então a fonte fica legível no celular e os rótulos são posicionados para
 * caber na largura de verdade.
 */
export function GraficoFluxo({ fluxo }: { fluxo: readonly MesFluxo[] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(LARGURA_INICIAL)
  const altura = largura < 480 ? 220 : 260

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = (w: number) => setLargura(Math.max(LARGURA_MINIMA, Math.round(w)))
    medir(el.clientWidth)
    const observador = new ResizeObserver(([e]) => medir(e.contentRect.width))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const g = useMemo(
    () =>
      layoutFluxo(fluxo, largura, altura, {
        fonte: FONTE,
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
      }),
    [fluxo, largura, altura],
  )
  const [foco, setFoco] = useState<number | null>(null)

  function mover(e: PointerEvent<SVGSVGElement>) {
    const area = e.currentTarget.getBoundingClientRect()
    if (g.pontos.length === 0 || area.width === 0) return
    const x = ((e.clientX - area.left) / area.width) * largura
    let melhor = 0
    for (let i = 1; i < g.pontos.length; i++) {
      if (Math.abs(g.pontos[i].x - x) < Math.abs(g.pontos[melhor].x - x)) melhor = i
    }
    setFoco(melhor)
  }

  if (g.pontos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem fluxo de caixa para exibir.</p>
  }
  const ponto = foco === null ? null : g.pontos[foco]
  const texto = { fontSize: FONTE }

  return (
    <figure className="space-y-2">
      <div ref={caixa} className="w-full">
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          className="block h-auto w-full touch-none"
          role="img"
          aria-label="Fluxo de caixa acumulado do cenário base, mês a mês"
          onPointerMove={mover}
          onPointerLeave={() => setFoco(null)}
        >
          {g.ticksY.map((t) => (
            <line
              key={t.valor}
              x1={g.margens.esquerda}
              x2={largura - g.margens.direita}
              y1={t.y}
              y2={t.y}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
          {g.rotulosY.map((r, i) => (
            <text
              key={i}
              x={r.x}
              y={r.y}
              textAnchor={r.ancora}
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={texto}
            >
              {r.texto}
            </text>
          ))}
          {g.rotulosX.map((r, i) => (
            <text
              key={i}
              x={r.x}
              y={r.y}
              textAnchor={r.ancora}
              className="fill-muted-foreground"
              style={texto}
            >
              {r.texto}
            </text>
          ))}
          <line
            x1={g.margens.esquerda}
            x2={largura - g.margens.direita}
            y1={g.zeroY}
            y2={g.zeroY}
            className="stroke-muted-foreground"
            strokeWidth={1.5}
          />
          <path d={g.area} className="fill-brand/10" />
          <path d={g.caminho} className="fill-none stroke-brand" strokeWidth={2.5} />
          {g.minimo && (
            <circle cx={g.minimo.x} cy={g.minimo.y} r={4.5} className="fill-destructive" />
          )}
          {g.rotuloExposicao && (
            <text
              x={g.rotuloExposicao.x}
              y={g.rotuloExposicao.y}
              textAnchor={g.rotuloExposicao.ancora}
              className="fill-destructive font-medium"
              style={texto}
            >
              {g.rotuloExposicao.texto}
            </text>
          )}
          {g.payback && (
            <line
              x1={g.payback.x}
              x2={g.payback.x}
              y1={g.margens.topo}
              y2={altura - g.margens.base}
              className="stroke-brand"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          {g.rotuloPayback && (
            <text
              x={g.rotuloPayback.x}
              y={g.rotuloPayback.y}
              textAnchor={g.rotuloPayback.ancora}
              className="fill-brand"
              style={texto}
            >
              {g.rotuloPayback.texto}
            </text>
          )}
          {ponto && (
            <g>
              <line
                x1={ponto.x}
                x2={ponto.x}
                y1={g.margens.topo}
                y2={altura - g.margens.base}
                className="stroke-foreground/40"
                strokeWidth={1}
              />
              <circle cx={ponto.x} cy={ponto.y} r={4} className="fill-brand" />
            </g>
          )}
        </svg>
      </div>
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Fluxo de caixa acumulado, cenário base (R$).</span>
        <span aria-live="polite" className="tabular-nums">
          {ponto
            ? `Mês ${ponto.mes}: ${formatBRL(ponto.acumulado)}`
            : "Passe o mouse para ver cada mês."}
        </span>
      </figcaption>
    </figure>
  )
}

"use client"

import { useMemo, useRef, useState, type PointerEvent } from "react"

import type { MesFluxo } from "@/lib/feasibility"
import { formatBRL } from "@/lib/format"
import { geometriaFluxo } from "@/lib/relatorio/grafico"

const LARGURA = 720
const ALTURA = 260

/** Fluxo de caixa acumulado do cenário base, com exposição máxima e payback. */
export function GraficoFluxo({ fluxo }: { fluxo: readonly MesFluxo[] }) {
  const g = useMemo(() => geometriaFluxo(fluxo, LARGURA, ALTURA), [fluxo])
  const svg = useRef<SVGSVGElement>(null)
  const [foco, setFoco] = useState<number | null>(null)

  function mover(e: PointerEvent<SVGSVGElement>) {
    const caixa = svg.current?.getBoundingClientRect()
    if (!caixa || g.pontos.length === 0) return
    const x = ((e.clientX - caixa.left) / caixa.width) * LARGURA
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

  return (
    <figure className="space-y-2">
      <svg
        ref={svg}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Fluxo de caixa acumulado do cenário base, mês a mês"
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        {g.ticksY.map((t) => (
          <g key={t.valor}>
            <line
              x1={g.margens.esquerda}
              x2={LARGURA - g.margens.direita}
              y1={t.y}
              y2={t.y}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={g.margens.esquerda - 8}
              y={t.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {formatBRL(t.valor, { compact: true })}
            </text>
          </g>
        ))}
        {g.ticksX.map((t) => (
          <text
            key={t.mes}
            x={t.x}
            y={ALTURA - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {t.rotulo}
          </text>
        ))}
        <line
          x1={g.margens.esquerda}
          x2={LARGURA - g.margens.direita}
          y1={g.zeroY}
          y2={g.zeroY}
          className="stroke-muted-foreground"
          strokeWidth={1.5}
        />
        <path d={g.area} className="fill-brand/10" />
        <path d={g.caminho} className="fill-none stroke-brand" strokeWidth={2.5} />
        {g.minimo && (
          <g>
            <circle cx={g.minimo.x} cy={g.minimo.y} r={4.5} className="fill-destructive" />
            <text
              x={g.minimo.x + 8}
              y={g.minimo.y + 14}
              className="fill-destructive text-[11px] font-medium"
            >
              Exposição máx. {formatBRL(-g.minimo.acumulado, { compact: true })} (mês {g.minimo.mes}
              )
            </text>
          </g>
        )}
        {g.payback && (
          <g>
            <line
              x1={g.payback.x}
              x2={g.payback.x}
              y1={g.margens.topo}
              y2={ALTURA - g.margens.base}
              className="stroke-brand"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={g.payback.x - 6}
              y={g.margens.topo + 10}
              textAnchor="end"
              className="fill-brand text-[11px]"
            >
              Payback: mês {g.payback.mes}
            </text>
          </g>
        )}
        {ponto && (
          <g>
            <line
              x1={ponto.x}
              x2={ponto.x}
              y1={g.margens.topo}
              y2={ALTURA - g.margens.base}
              className="stroke-foreground/40"
              strokeWidth={1}
            />
            <circle cx={ponto.x} cy={ponto.y} r={4} className="fill-brand" />
          </g>
        )}
      </svg>
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

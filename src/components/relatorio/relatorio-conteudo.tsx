"use client"

import { BadgeCheck, MapPin, TriangleAlert } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { DEFINICOES, LIMITANTE, NIVEL } from "@/components/estudo/definicoes"
import { FatoresRisco } from "@/components/estudo/fatores-risco"
import { Kpi } from "@/components/estudo/kpi"
import { ListaAvisos } from "@/components/estudo/lista-avisos"
import { TabelaCenarios } from "@/components/estudo/tabela-cenarios"
import { TabelaPremissas } from "@/components/estudo/tabela-premissas"
import { GeoMap, type MapOverlay } from "@/components/map/geo-map"
import { Badge } from "@/components/ui/badge"
import { LAND_STATUS, LAND_USE } from "@/lib/domain/labels"
import type { EntradaViabilidade, ResultadoViabilidade } from "@/lib/feasibility"
import { formatArea, formatBRL, formatMeters, formatNumber, formatPercent } from "@/lib/format"
import { bboxOfGeometries } from "@/lib/geo/feature-collection"
import { parametrosUrbanisticos, restricoesEmTexto } from "@/lib/relatorio/secoes"
import type { ContextoEstudo } from "@/lib/relatorio/tipos"
import type { Enums, Json } from "@/lib/supabase/database.types"

import { GraficoFluxo } from "./grafico-fluxo"

export type TerrenoResumoRelatorio = {
  codigo: string
  endereco: string
  bairro: string | null
  municipio: string
  uf: string
  situacao?: Enums<"land_status">
  geojson: Json | null
  ficticio: boolean
}

function Secao({
  titulo,
  children,
  acao,
}: {
  titulo: string
  children: ReactNode
  acao?: ReactNode
}) {
  return (
    <section className="@container space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Conteúdo do relatório (somente leitura): usado na página e no link compartilhado. */
export function RelatorioConteudo({
  entrada,
  resultado,
  contexto,
  terreno,
  alteradas = [],
}: {
  entrada: EntradaViabilidade
  resultado: ResultadoViabilidade
  contexto: Partial<ContextoEstudo>
  terreno: TerrenoResumoRelatorio | null
  /** Premissas ajustadas no rascunho, realçadas na tabela. */
  alteradas?: readonly string[]
}) {
  const m = resultado.base?.metricas
  const p = resultado.potencial
  const urbanisticos = parametrosUrbanisticos(entrada)
  const nivel = NIVEL[resultado.risco.nivel]

  const overlays = useMemo<MapOverlay[]>(
    () =>
      terreno?.geojson
        ? [
            {
              id: "lote",
              label: terreno.codigo,
              color: "#0d968b",
              data: terreno.geojson as unknown as GeoJSON.GeoJSON,
              fillOpacity: 0.3,
            },
          ]
        : [],
    [terreno],
  )
  const ponto = contexto.ponto ?? null
  const enquadrar = useMemo(() => {
    if (terreno?.geojson) return bboxOfGeometries([terreno.geojson])
    if (ponto) {
      const d = 0.004
      return [ponto.longitude - d, ponto.latitude - d, ponto.longitude + d, ponto.latitude + d] as [
        number,
        number,
        number,
        number,
      ]
    }
    return null
  }, [terreno, ponto])

  return (
    <div className="space-y-6">
      <Secao
        titulo="Resumo"
        acao={
          <Badge variant="outline" className={nivel.classe}>
            {nivel.rotulo} · {resultado.risco.score}
          </Badge>
        }
      >
        <ListaAvisos titulo="Pendências" itens={resultado.pendencias} destaque />
        {m && resultado.base ? (
          <dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
            <Kpi
              rotulo="Margem líquida"
              valor={formatPercent(m.margemVgv)}
              definicao={DEFINICOES.margem}
            />
            <Kpi rotulo="ROI" valor={formatPercent(m.roi)} definicao={DEFINICOES.roi} />
            <Kpi rotulo="TIR anual" valor={formatPercent(m.tirAnual)} definicao={DEFINICOES.tir} />
            <Kpi
              rotulo="Payback"
              valor={m.paybackMeses === null ? "Não retorna" : `${m.paybackMeses} meses`}
              definicao={DEFINICOES.payback}
            />
            <Kpi rotulo="VGV" valor={formatBRL(resultado.base.vgv, { compact: true })} />
            <Kpi
              rotulo="Lucro"
              valor={formatBRL(m.lucro, { compact: true })}
              negativo={m.lucro < 0}
            />
            <Kpi rotulo="Custo total" valor={formatBRL(m.custoTotal, { compact: true })} />
            <Kpi
              rotulo="Exposição máxima"
              valor={formatBRL(m.exposicaoMaxima, { compact: true })}
              definicao={DEFINICOES.exposicao}
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            O estudo não tem resultado financeiro: veja as pendências.
          </p>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {contexto.uso && <span>Uso: {LAND_USE[contexto.uso]}</span>}
          {terreno?.situacao && <span>Situação do lote: {LAND_STATUS[terreno.situacao]}</span>}
          <span>
            Zona: {entrada.terreno.zona.codigo ?? "não identificada"}
            {entrada.terreno.zona.zonasCruzadas > 1
              ? ` (lote cruza ${entrada.terreno.zona.zonasCruzadas} zonas)`
              : ""}
          </span>
        </div>
      </Secao>

      {resultado.cenarios.length > 0 && (
        <Secao titulo="Cenários">
          <TabelaCenarios cenarios={resultado.cenarios} />
        </Secao>
      )}

      {resultado.base && (
        <Secao titulo="Fluxo de caixa acumulado">
          <GraficoFluxo fluxo={resultado.base.fluxo} />
        </Secao>
      )}

      {p && (
        <Secao titulo="Potencial construtivo">
          <dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
            <Kpi rotulo="Área computável" valor={formatArea(p.areaComputavelM2)} />
            <Kpi rotulo="Área privativa" valor={formatArea(p.areaPrivativaM2)} />
            <Kpi rotulo="Pavimentos" valor={`${p.pavimentos} (${formatMeters(p.alturaM)})`} />
            <Kpi
              rotulo="CA aplicado"
              valor={`${formatNumber(p.caAplicado)}${p.usaOutorga ? " (outorga)" : ""}`}
            />
          </dl>
          <p className="text-sm text-muted-foreground">
            Limitado por <strong className="text-foreground">{LIMITANTE[p.limitante]}</strong>;
            projeção do pavimento-tipo de {formatArea(p.projecaoM2)}, limitada por{" "}
            {LIMITANTE[p.projecaoLimitadaPor]}.
            {p.testadaEstimada ? " Testada estimada (lote aproximado por um quadrado)." : ""}
          </p>
        </Secao>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Situação urbanística">
          {entrada.regra.status === "validado" ? (
            <ul className="space-y-2 text-sm">
              {urbanisticos.map((u) => (
                <li key={u.campo} className="flex gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>
                    <span className="font-medium">{u.rotulo}:</span> {u.valor}
                    <span className="block text-xs text-muted-foreground">
                      {u.fonte ?? "sem fonte vinculada"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Não há regra urbanística validada para este uso na zona.
            </p>
          )}
          {entrada.terreno.restricoes.length > 0 && (
            <ul className="space-y-1 text-sm">
              {restricoesEmTexto(entrada).map((texto) => (
                <li key={texto} className="flex gap-2 text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {texto}
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Localização">
          {enquadrar ? (
            <GeoMap
              ariaLabel="Mapa do terreno do relatório"
              overlays={overlays}
              marker={terreno?.geojson ? null : ponto}
              fitBounds={enquadrar}
              mapClassName="h-64"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem geometria cadastrada para este estudo.
            </p>
          )}
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            {terreno
              ? `${terreno.codigo} · ${terreno.endereco}${terreno.bairro ? `, ${terreno.bairro}` : ""} · ${terreno.municipio}/${terreno.uf}`
              : (contexto.referencia ?? "Local não informado")}
          </p>
        </Secao>
      </div>

      <Secao titulo="Risco">
        <FatoresRisco risco={resultado.risco} />
      </Secao>

      <Secao titulo={`Premissas e fontes (${resultado.premissas.length})`}>
        <TabelaPremissas premissas={resultado.premissas} destacadas={alteradas} />
        <ListaAvisos titulo="Avisos" itens={resultado.avisos} />
      </Secao>

      <p className="text-sm text-muted-foreground italic">{resultado.disclaimer}</p>
    </div>
  )
}

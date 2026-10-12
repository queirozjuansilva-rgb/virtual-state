"use client"

import { BadgeCheck, MapPinned, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { GeoMap, type MapOverlay } from "@/components/map/geo-map"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { bboxOfGeometries } from "@/lib/geo/feature-collection"
import { obterPainelTerreno } from "@/server/copiloto/actions"
import type { PainelTerreno } from "@/server/copiloto/painel"

/** Campos de zoneamento destacados no painel (os demais ficam no cartão). */
const DESTAQUES = [
  "ca_basico",
  "ca_max",
  "to_max",
  "gabarito_m",
  "gabarito_pavimentos",
  "recuo_frontal",
]

type Estado =
  { status: "pronto"; id: string; painel: PainelTerreno } | { status: "erro"; id: string }

/** Painel "Contexto do lote": terreno em foco na conversa. */
export function PainelLote({ terrenoId }: { terrenoId: string | null }) {
  const [estado, setEstado] = useState<Estado | null>(null)

  useEffect(() => {
    if (!terrenoId) return
    let ativo = true
    obterPainelTerreno(terrenoId)
      .then((painel) => {
        if (!ativo) return
        setEstado(
          painel ? { status: "pronto", id: terrenoId, painel } : { status: "erro", id: terrenoId },
        )
      })
      .catch(() => ativo && setEstado({ status: "erro", id: terrenoId }))
    return () => {
      ativo = false
    }
  }, [terrenoId])

  if (!terrenoId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <MapPinned className="size-8 text-brand/60" aria-hidden />
        <p className="font-medium text-foreground">Contexto do lote</p>
        <p>
          Quando a conversa tratar de um terreno do land bank, o mapa, o zoneamento e o mercado dele
          aparecem aqui.
        </p>
      </div>
    )
  }
  // Enquanto o terreno em foco não carregou, o estado ainda é do anterior.
  if (!estado || estado.id !== terrenoId) return <PainelCarregando />
  if (estado.status === "erro") {
    return <p className="p-6 text-sm text-muted-foreground">Não foi possível carregar o terreno.</p>
  }
  return <Conteudo painel={estado.painel} />
}

function PainelCarregando() {
  return (
    <div className="space-y-4 p-4" aria-busy="true">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function Conteudo({ painel }: { painel: PainelTerreno }) {
  const { terreno: t, parametros: p, mercado: m } = painel
  const overlays = useMemo<MapOverlay[]>(
    () => [
      {
        id: "lote",
        label: t.codigo,
        color: "#0d968b",
        data: painel.geojson as GeoJSON.GeoJSON | null,
        fillOpacity: 0.3,
      },
    ],
    [painel.geojson, t.codigo],
  )
  const fit = useMemo(() => bboxOfGeometries([painel.geojson]), [painel.geojson])
  const regra = p.regras.find((r) => r.uso === "residencial_vertical") ?? p.regras[0]
  const destaques = regra?.parametros.filter((x) => DESTAQUES.includes(x.campo)) ?? []
  const fontes = new Set(destaques.map((x) => x.fonte?.texto ?? null))
  const fonteUnica = fontes.size === 1 ? [...fontes][0] : null

  return (
    <div className="space-y-5 p-4">
      <GeoMap
        ariaLabel={`Mapa do terreno ${t.codigo}`}
        overlays={overlays}
        fitBounds={fit}
        mapClassName="h-48"
      />

      <section>
        <p className="flex items-center gap-2 font-semibold">
          {t.codigo}
          {t.ficticio && (
            <Badge variant="outline" className="text-muted-foreground">
              Fictício
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.endereco}
          {t.bairro ? ` · ${t.bairro}` : ""} · {t.municipio}/{t.uf}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Dado rotulo="Área" valor={t.area_fmt} />
          <Dado rotulo="Preço pedido" valor={t.preco_fmt} />
          <Dado rotulo="Situação" valor={t.situacao} />
          <Dado rotulo="Negociação" valor={t.negociacao ?? "—"} />
        </dl>
      </section>

      <section>
        <h4 className="mb-2 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase">
          Destaques de zoneamento {p.zona ? `· ${p.zona.codigo}` : ""}
        </h4>
        {p.status === "validado" && regra ? (
          <ul className="space-y-2 text-xs">
            <li className="text-muted-foreground">{regra.uso_rotulo}</li>
            {destaques.map((x) => (
              <li key={x.campo} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="font-medium">{x.rotulo}:</span> {x.valor}
                  {!fonteUnica && x.fonte && (
                    <span className="block text-muted-foreground">{x.fonte.texto}</span>
                  )}
                </span>
              </li>
            ))}
            {fonteUnica && <li className="text-muted-foreground">Fonte: {fonteUnica}</li>}
          </ul>
        ) : (
          <p className="flex gap-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {p.mensagem ?? "Sem parâmetros validados para este lote."}
          </p>
        )}
        {t.restricoes.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-xs">
            {t.restricoes.map((r) => (
              <li
                key={`${r.tipo}-${r.descricao}`}
                className="flex gap-2 text-amber-800 dark:text-amber-300"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {r.tipo}: {r.descricao}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {m && (
        <section>
          <h4 className="mb-2 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase">
            Mercado · {m.tipologia}
          </h4>
          {m.comparaveis ? (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Dado rotulo="Mediana" valor={m.comparaveis.mediana_m2_fmt} />
              <Dado rotulo="Amostras" valor={String(m.comparaveis.n)} />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">Sem comparáveis na região.</p>
          )}
          {m.cub && (
            <p className="mt-2 text-xs text-muted-foreground">
              CUB {m.cub.padrao}/{m.cub.uf}: {m.cub.valor_fmt} ({m.cub.mes_fmt})
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
      <dt className="text-[0.65rem] text-muted-foreground uppercase">{rotulo}</dt>
      <dd className="truncate font-semibold tabular-nums">{valor}</dd>
    </div>
  )
}

import { CircleCheck, MapPinned, TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { FictitiousBadge, LandStatusBadge } from "@/components/admin/badges"
import { LandForm } from "@/components/admin/land-form"
import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { ENVIRONMENTAL_LAYER_KIND } from "@/lib/domain/labels"
import { formatArea, formatPercent } from "@/lib/format"
import { saveLand } from "@/server/admin/actions"
import {
  getLand,
  getLandEnvironmentalHits,
  getLandZoneHits,
  listGeoReference,
  listMunicipalityOptions,
} from "@/server/admin/queries"

export const metadata: Metadata = { title: "Terreno" }

async function LandPageContent({ params, searchParams }: PageProps<"/admin/terrenos/[id]">) {
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const land = await getLand(id)
  const [municipalities, { zones, layers }, zoneHits, envHits] = await Promise.all([
    listMunicipalityOptions(),
    listGeoReference(),
    land.geojson ? getLandZoneHits(land.geojson, land.municipality_id) : Promise.resolve([]),
    land.geojson
      ? getLandEnvironmentalHits(land.geojson, land.municipality_id)
      : Promise.resolve([]),
  ])
  const owner = Array.isArray(land.owner) ? land.owner[0] : land.owner
  const mainHit = zoneHits.find((h) => h.zone_id === land.zone_id)

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {land.code}
            <LandStatusBadge status={land.status} />
            {land.is_fictitious && <FictitiousBadge />}
          </span>
        }
        description={`${land.address}${land.neighborhood ? ` · ${land.neighborhood}` : ""}${land.municipality ? ` · ${land.municipality.name}/${land.municipality.uf}` : ""}`}
      />

      {salvo && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
        >
          <CircleCheck className="size-4 text-primary" aria-hidden /> Terreno cadastrado. Confira a
          zona identificada abaixo.
        </p>
      )}

      <section
        aria-label="Resumo do zoneamento"
        className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3 sm:p-6"
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Área
          </p>
          <p className="text-lg font-semibold tabular-nums">{formatArea(land.area_m2)}</p>
          <p className="text-xs text-muted-foreground">
            {land.area_informada_m2 !== null
              ? `Informada manualmente (polígono: ${formatArea(land.area_calculada_m2)})`
              : "Calculada do polígono (PostGIS, elipsoide WGS84)"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Zona
          </p>
          {land.zone ? (
            <>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <MapPinned className="size-5 text-brand" aria-hidden />
                <Link
                  href={`/admin/zonas/${land.zone.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {land.zone.code}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {land.zone.name}.{" "}
                {land.zone_assignment === "manual"
                  ? "Atribuída manualmente."
                  : `Interseção automática${mainHit ? `: ${formatPercent(mainHit.overlap_ratio)} da área` : ""}.`}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="size-4" aria-hidden /> Não identificada. Atribua a zona
              manualmente.
            </p>
          )}
          {land.zones_overlap_count > 1 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <TriangleAlert className="size-3.5" aria-hidden /> O lote cruza{" "}
              {land.zones_overlap_count} zonas:{" "}
              {zoneHits.map((h) => `${h.code} (${formatPercent(h.overlap_ratio)})`).join(", ")}.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Restrições ambientais
          </p>
          {envHits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma camada cadastrada cruza o lote.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {envHits.map((h) => (
                <li
                  key={h.layer_id}
                  className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {ENVIRONMENTAL_LAYER_KIND[h.kind]}: {formatArea(h.overlap_m2)}
                  {h.is_fictitious ? " (fictícia)" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <LandForm
        action={saveLand.bind(null, land.id)}
        initial={{ ...land, owner: owner ?? null }}
        municipalities={municipalities}
        zones={zones}
        layers={layers}
        submitLabel="Salvar alterações"
      />
    </PageContainer>
  )
}

/** Shell estático + conteúdo dependente da URL em Suspense (navegação instantânea). */
export default function LandPage(props: PageProps<"/admin/terrenos/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <LandPageContent {...props} />
    </Suspense>
  )
}

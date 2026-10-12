"use client"

import { useMemo } from "react"

import { GeoMap } from "@/components/map/geo-map"
import { bboxOfGeometries, toFeatureCollection } from "@/lib/geo/feature-collection"

/** Mapa (somente leitura) com as zonas e camadas ambientais de um município. */
export function ZonesOverviewMap({
  zones,
  layers,
  highlightId,
}: {
  zones: { id: string; code: string; geojson: unknown }[]
  layers: { id: string; geojson: unknown }[]
  highlightId?: string
}) {
  const overlays = useMemo(
    () => [
      {
        id: "zones",
        label: "Zonas",
        color: "#4f9fb0" as const,
        fillOpacity: 0.12,
        data: toFeatureCollection(zones.filter((z) => z.id !== highlightId)),
      },
      ...(highlightId
        ? [
            {
              id: "highlight",
              label: "Esta zona",
              color: "#0d968b" as const,
              fillOpacity: 0.3,
              data: toFeatureCollection(zones.filter((z) => z.id === highlightId)),
            },
          ]
        : []),
      {
        id: "environmental",
        label: "Restrições ambientais",
        color: "#d97706" as const,
        fillOpacity: 0.2,
        data: toFeatureCollection(layers),
      },
    ],
    [zones, layers, highlightId],
  )
  const fit = useMemo(() => {
    const target = highlightId ? zones.filter((z) => z.id === highlightId) : zones
    return bboxOfGeometries(target.map((z) => z.geojson))
  }, [zones, highlightId])

  return <GeoMap ariaLabel="Mapa das zonas do município" overlays={overlays} fitBounds={fit} />
}

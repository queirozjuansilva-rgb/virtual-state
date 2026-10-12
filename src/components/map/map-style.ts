import type { StyleSpecification } from "maplibre-gl"

import { publicEnv } from "@/lib/env"

/**
 * Estilo base do mapa (ADR 0004). Com NEXT_PUBLIC_MAPTILER_KEY usa MapTiler;
 * sem chave, cai para os tiles públicos do OpenStreetMap, aceitáveis só em
 * desenvolvimento (a política de uso do OSM não permite tráfego de produção).
 */
export function mapStyle(): string | StyleSpecification {
  const key = publicEnv.NEXT_PUBLIC_MAPTILER_KEY
  if (key)
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`

  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© colaboradores do OpenStreetMap",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  }
}

/** Centro padrão quando não há geometria: Fortaleza/CE (seed). */
export const DEFAULT_CENTER: [number, number] = [-38.5267, -3.7319]

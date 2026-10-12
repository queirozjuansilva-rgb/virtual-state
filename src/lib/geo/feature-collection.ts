/** Monta uma FeatureCollection a partir de linhas do banco com coluna geojson. */
export function toFeatureCollection<T extends { geojson: unknown }>(
  rows: T[],
  properties: (row: T) => Record<string, unknown> = () => ({}),
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows
      .filter((row) => row.geojson)
      .map((row) => ({
        type: "Feature",
        geometry: row.geojson as GeoJSON.Geometry,
        properties: properties(row),
      })),
  }
}

/** Caixa envolvente [oeste, sul, leste, norte] de várias geometrias GeoJSON. */
export function bboxOfGeometries(geometries: unknown[]): [number, number, number, number] | null {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number]
      w = Math.min(w, lon)
      s = Math.min(s, lat)
      e = Math.max(e, lon)
      n = Math.max(n, lat)
      return
    }
    coords.forEach(visit)
  }
  for (const g of geometries) visit((g as { coordinates?: unknown } | null)?.coordinates)
  return Number.isFinite(w) ? [w, s, e, n] : null
}

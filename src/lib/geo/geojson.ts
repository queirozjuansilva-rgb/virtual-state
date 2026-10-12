import { z } from "zod"

/** [longitude, latitude] em WGS84 (EPSG:4326). Altitude, se houver, é descartada. */
export type Position = [number, number]
export type Ring = Position[]
export type PolygonGeometry = { type: "Polygon"; coordinates: Ring[] }
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Ring[][] }

export const MAX_VERTICES = 5000

export class GeoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GeoError"
  }
}

const position = z
  .array(z.number().refine(Number.isFinite))
  .min(2)
  .transform((p) => [p[0]!, p[1]!] as Position)
  .refine(([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, {
    error: "Coordenada fora dos limites de longitude/latitude.",
  })

const ringSchema = z.array(position)
const polygonCoords = z.array(ringSchema).min(1)

const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygonCoords }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygonCoords).min(1) }),
])

type ParsedGeometry = z.infer<typeof geometrySchema>

function samePosition(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1]
}

/** Fecha o anel se preciso e valida o mínimo de 4 posições. */
function normalizeRing(ring: Ring): Ring {
  if (ring.length === 0) throw new GeoError("O polígono tem um anel vazio.")
  const closed = samePosition(ring[0]!, ring.at(-1)!) ? ring : [...ring, ring[0]!]
  if (closed.length < 4) {
    throw new GeoError("Cada polígono precisa de pelo menos 3 vértices distintos.")
  }
  return closed
}

function collectPolygons(value: unknown): ParsedGeometry[] {
  if (typeof value !== "object" || value === null) {
    throw new GeoError("Arquivo não contém GeoJSON válido.")
  }
  const obj = value as { type?: unknown }
  switch (obj.type) {
    case "Polygon":
    case "MultiPolygon": {
      const parsed = geometrySchema.safeParse(value)
      if (!parsed.success) {
        throw new GeoError(parsed.error.issues[0]?.message ?? "Geometria inválida.")
      }
      return [parsed.data]
    }
    case "Feature":
      return collectPolygons((value as { geometry?: unknown }).geometry ?? null)
    case "FeatureCollection": {
      const features = (value as { features?: unknown }).features
      if (!Array.isArray(features)) throw new GeoError("FeatureCollection sem a lista features.")
      return features.flatMap((f) => {
        const type = (f as { geometry?: { type?: unknown } } | null)?.geometry?.type
        // Ignora pontos/linhas (comuns em KML); só polígonos definem o lote.
        return type === "Polygon" || type === "MultiPolygon" ? collectPolygons(f) : []
      })
    }
    case "GeometryCollection": {
      const geometries = (value as { geometries?: unknown }).geometries
      if (!Array.isArray(geometries)) throw new GeoError("GeometryCollection inválida.")
      return geometries.flatMap((g) => {
        const type = (g as { type?: unknown } | null)?.type
        return type === "Polygon" || type === "MultiPolygon" ? collectPolygons(g) : []
      })
    }
    default:
      throw new GeoError("Tipo de geometria não suportado. Envie um polígono.")
  }
}

/**
 * Converte qualquer GeoJSON com polígonos (Polygon, MultiPolygon, Feature,
 * FeatureCollection, GeometryCollection) num MultiPolygon normalizado.
 */
export function toMultiPolygon(value: unknown): MultiPolygonGeometry {
  const geometries = collectPolygons(value)
  const polygons = geometries.flatMap((g) =>
    g.type === "Polygon" ? [g.coordinates] : g.coordinates,
  )
  if (polygons.length === 0) throw new GeoError("Nenhum polígono encontrado no arquivo.")

  const coordinates = polygons.map((rings) => rings.map(normalizeRing))
  const vertices = coordinates.flat(2).length
  if (vertices > MAX_VERTICES) {
    throw new GeoError(`Geometria complexa demais (${vertices} vértices; máx. ${MAX_VERTICES}).`)
  }
  return { type: "MultiPolygon", coordinates }
}

/** Lê o texto de um arquivo .geojson/.json. */
export function parseGeoJsonText(text: string): MultiPolygonGeometry {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new GeoError("O arquivo não é um JSON válido.")
  }
  return toMultiPolygon(value)
}

/** Schema Zod para receber a geometria do lote em Server Actions (string JSON). */
export const multiPolygonFromString = z.string().transform((text, ctx) => {
  try {
    return parseGeoJsonText(text)
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof GeoError ? error.message : "Geometria inválida.",
    })
    return z.NEVER
  }
})

/** Caixa envolvente [oeste, sul, leste, norte]. */
export function bbox(geometry: MultiPolygonGeometry): [number, number, number, number] {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lon, lat] of geometry.coordinates.flat(2)) {
    w = Math.min(w, lon)
    s = Math.min(s, lat)
    e = Math.max(e, lon)
    n = Math.max(n, lat)
  }
  return [w, s, e, n]
}

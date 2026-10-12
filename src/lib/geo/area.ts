import type { MultiPolygonGeometry, Ring } from "./geojson"

/**
 * Área (m²) para prévia na tela. Projeta o polígono num plano local usando os
 * raios de curvatura do elipsoide WGS84 na latitude média e aplica a fórmula
 * do laço (shoelace). Para lotes urbanos o erro frente ao PostGIS (área no
 * elipsoide, valor oficial gravado no banco) é desprezível.
 */
const A = 6378137 // semieixo maior (m)
const E2 = 0.00669437999014 // excentricidade²

const rad = (deg: number) => (deg * Math.PI) / 180

function metersPerDegree(latDeg: number) {
  const sin = Math.sin(rad(latDeg))
  const w = 1 - E2 * sin * sin
  const meridional = (A * (1 - E2)) / Math.pow(w, 1.5)
  const primeVertical = A / Math.sqrt(w)
  return {
    lat: rad(1) * meridional,
    lon: rad(1) * primeVertical * Math.cos(rad(latDeg)),
  }
}

function ringArea(ring: Ring, k: { lat: number; lon: number }, origin: [number, number]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = [(ring[i]![0] - origin[0]) * k.lon, (ring[i]![1] - origin[1]) * k.lat]
    const [x2, y2] = [(ring[i + 1]![0] - origin[0]) * k.lon, (ring[i + 1]![1] - origin[1]) * k.lat]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function geodesicArea(geometry: MultiPolygonGeometry): number {
  return geometry.coordinates.reduce((total, rings) => {
    const outer = rings[0]
    if (!outer || outer.length < 4) return total
    const lats = outer.map((p) => p[1])
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const k = metersPerDegree(midLat)
    const origin = outer[0]!
    const [shell, ...holes] = rings.map((ring) => ringArea(ring, k, origin))
    return total + shell! - holes.reduce((h, a) => h + a, 0)
  }, 0)
}

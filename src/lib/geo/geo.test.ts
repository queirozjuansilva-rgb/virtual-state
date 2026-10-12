import { describe, expect, it } from "vitest"

import { geodesicArea } from "./area"
import { bbox, GeoError, multiPolygonFromString, parseGeoJsonText, toMultiPolygon } from "./geojson"

/** Retângulo de largura × profundidade (m) a partir do canto sudoeste. */
function rectangle(lon0: number, lat0: number, widthM: number, depthM: number) {
  const lon1 = lon0 + widthM / (111320 * Math.cos((lat0 * Math.PI) / 180))
  const lat1 = lat0 + depthM / 110574
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [lon0, lat0],
        [lon1, lat0],
        [lon1, lat1],
        [lon0, lat1],
        [lon0, lat0],
      ],
    ],
  }
}

describe("toMultiPolygon", () => {
  const poly = rectangle(-38.5, -3.729, 30, 40)

  it("converte Polygon em MultiPolygon", () => {
    const mp = toMultiPolygon(poly)
    expect(mp.type).toBe("MultiPolygon")
    expect(mp.coordinates).toHaveLength(1)
  })

  it("aceita Feature e FeatureCollection, ignorando pontos e linhas", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", properties: {}, geometry: poly },
        { type: "Feature", properties: {}, geometry: poly },
      ],
    }
    expect(toMultiPolygon(fc).coordinates).toHaveLength(2)
    expect(toMultiPolygon({ type: "Feature", geometry: poly }).coordinates).toHaveLength(1)
  })

  it("fecha anéis abertos e descarta altitude", () => {
    const open = {
      type: "Polygon",
      coordinates: [
        [
          [-38.5, -3.73, 12],
          [-38.4997, -3.73, 12],
          [-38.4997, -3.7297, 12],
        ],
      ],
    }
    const ring = toMultiPolygon(open).coordinates[0]![0]!
    expect(ring).toHaveLength(4)
    expect(ring[0]).toEqual([-38.5, -3.73])
    expect(ring.at(-1)).toEqual([-38.5, -3.73])
  })

  it.each([
    [null, "Arquivo não contém GeoJSON válido."],
    [{ type: "Point", coordinates: [0, 0] }, "Tipo de geometria não suportado"],
    [{ type: "FeatureCollection", features: [] }, "Nenhum polígono encontrado"],
    [
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      "pelo menos 3 vértices",
    ],
    [
      {
        type: "Polygon",
        coordinates: [
          [
            [200, 0],
            [1, 1],
            [1, 0],
            [200, 0],
          ],
        ],
      },
      "fora dos limites",
    ],
  ])("rejeita %j", (input, message) => {
    expect(() => toMultiPolygon(input)).toThrow(GeoError)
    expect(() => toMultiPolygon(input)).toThrow(message)
  })

  it("limita o número de vértices", () => {
    const ring = Array.from({ length: 6000 }, (_, i) => [
      -38.5 + Math.cos(i) * 0.001,
      -3.7 + Math.sin(i) * 0.001,
    ])
    expect(() => toMultiPolygon({ type: "Polygon", coordinates: [ring] })).toThrow(
      "complexa demais",
    )
  })
})

describe("parseGeoJsonText / multiPolygonFromString", () => {
  it("rejeita JSON inválido", () => {
    expect(() => parseGeoJsonText("{nope")).toThrow("não é um JSON válido")
  })

  it("valida via Zod com mensagem em pt-BR", () => {
    const ok = multiPolygonFromString.safeParse(JSON.stringify(rectangle(-38.5, -3.7, 10, 10)))
    expect(ok.success).toBe(true)
    const bad = multiPolygonFromString.safeParse('{"type":"Point","coordinates":[0,0]}')
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.message).toContain("Envie um polígono")
  })
})

describe("geodesicArea", () => {
  it("bate com a área do PostGIS para o lote VE-0001 (1200,07 m², ±0,1%)", () => {
    const area = geodesicArea(toMultiPolygon(rectangle(-38.5, -3.729, 30, 40)))
    expect(Math.abs(area - 1200.07) / 1200.07).toBeLessThan(0.001)
  })

  it("desconta buracos", () => {
    const outer = rectangle(-38.5, -3.7, 100, 100).coordinates[0]!
    const hole = rectangle(-38.4995, -3.6995, 20, 20).coordinates[0]!
    const area = geodesicArea(toMultiPolygon({ type: "Polygon", coordinates: [outer, hole] }))
    expect(area).toBeGreaterThan(9600 * 0.99)
    expect(area).toBeLessThan(9600 * 1.01)
  })
})

describe("bbox", () => {
  it("calcula a caixa envolvente", () => {
    const [w, s, e, n] = bbox(toMultiPolygon(rectangle(-38.5, -3.73, 30, 40)))
    expect(w).toBe(-38.5)
    expect(s).toBe(-3.73)
    expect(e).toBeGreaterThan(w)
    expect(n).toBeGreaterThan(s)
  })
})

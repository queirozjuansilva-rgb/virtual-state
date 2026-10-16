import { describe, expect, it } from "vitest"

import {
  agruparPorAtributo,
  feicoesComNome,
  lerColecao,
  resumirCamada,
  siglaDaZona,
  textoDoAtributo,
} from "./importacao"

const quadrado = (x: number) => [
  [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
    [x, 1],
    [x, 0],
  ],
]

const colecao = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { Nome: "ZEIS 1", descricao: "<b>Zona</b>&nbsp;especial" },
      geometry: { type: "Polygon", coordinates: quadrado(0) },
    },
    {
      type: "Feature",
      properties: { Nome: "ZEIS 1" },
      geometry: { type: "MultiPolygon", coordinates: [quadrado(2)] },
    },
    {
      type: "Feature",
      properties: { Nome: "ZEIS 2" },
      geometry: { type: "Polygon", coordinates: quadrado(4) },
    },
    {
      type: "Feature",
      properties: { Nome: "Pista" },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    },
  ],
}

describe("importação de camadas GeoJSON", () => {
  it("lê a coleção e resume atributos e geometrias", () => {
    const f = lerColecao(colecao)
    const r = resumirCamada(f)
    expect(r).toMatchObject({ feicoes: 4, poligonos: 3 })
    expect(r.tiposGeometria).toEqual(["Polygon", "MultiPolygon", "LineString"])
    expect(r.propriedades.find((p) => p.nome === "Nome")).toMatchObject({ distintos: 3 })
    expect(() => lerColecao({ type: "Feature" })).toThrow(/FeatureCollection/)
  })

  it("limpa HTML dos atributos", () => {
    expect(textoDoAtributo("<b>Zona da Orla</b> <p></p> <i>Taxa: <b>30</b>")).toBe(
      "Zona da Orla Taxa: 30",
    )
    expect(textoDoAtributo(null)).toBe("")
  })

  it("agrupa polígonos da mesma zona e ignora linhas", () => {
    const grupos = agruparPorAtributo(lerColecao(colecao), "Nome")
    expect(grupos.map((g) => [g.valor, g.geometria.coordinates.length])).toEqual([
      ["ZEIS 1", 2],
      ["ZEIS 2", 1],
    ])
    expect(feicoesComNome(lerColecao(colecao), "Nome")).toHaveLength(3)
  })

  it("propõe siglas a partir do nome da zona", () => {
    expect(siglaDaZona("Zona de Ocupação Preferencial 1")).toBe("ZOP 1")
    expect(siglaDaZona("Zona de Ocupação Consolidada")).toBe("ZOC")
    expect(siglaDaZona("Zona de Requalificação Urbana 2")).toBe("ZRU 2")
    expect(siglaDaZona("Zona da Orla - Trecho III - SUBZONA 2 SETOR 1")).toBe(
      "ZO T-III S-2 SETOR 1",
    )
    expect(siglaDaZona("Zona de Ocupação Moderada 2 SUBZONA 1")).toBe("ZOMS 2 1")
  })
})

import { describe, expect, it } from "vitest"

import { landFormSchema, toLandRpcArgs } from "./land-input"

const MUNI = "3f0c6d1e-8a7b-4c2d-9e1f-0a1b2c3d4e5f"
const ZONE = "0d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6"

const polygon = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-38.5, -3.73],
      [-38.4997, -3.73],
      [-38.4997, -3.7297],
      [-38.5, -3.7297],
      [-38.5, -3.73],
    ],
  ],
})

const valid = {
  code: "VE-0100",
  address: "Rua Exemplo, 10",
  municipality_id: MUNI,
  status: "disponivel",
  zone_assignment: "automatica",
  geometry: polygon,
  cep: "60.165-000",
  preco_pedido: "4.200.000,00",
  esquina: "on",
}

describe("landFormSchema", () => {
  it("aceita um terreno válido e normaliza os campos", () => {
    const v = landFormSchema.parse(valid)
    expect(v.cep).toBe("60165000")
    expect(v.preco_pedido).toBe(4200000)
    expect(v.esquina).toBe(true)
    expect(v.tem_app).toBe(false)
    expect(v.geometry?.type).toBe("MultiPolygon")
    expect(v.testadas_m).toEqual([])
  })

  it("exige polígono ou área informada", () => {
    const r = landFormSchema.safeParse({ ...valid, geometry: "" })
    expect(r.success).toBe(false)
    expect(r.error?.issues.find((i) => i.path[0] === "geometry")?.message).toContain("polígono")
    expect(
      landFormSchema.safeParse({ ...valid, geometry: "", area_informada_m2: "1.200" }).success,
    ).toBe(true)
  })

  it("exige zona na atribuição manual", () => {
    const r = landFormSchema.safeParse({ ...valid, zone_assignment: "manual" })
    expect(r.error?.issues[0]?.path).toEqual(["zone_id"])
    expect(
      landFormSchema.safeParse({ ...valid, zone_assignment: "manual", zone_id: ZONE }).success,
    ).toBe(true)
  })

  it("exige % de permuta quando a negociação envolve permuta", () => {
    const r = landFormSchema.safeParse({ ...valid, negociacao: "permuta_fisica" })
    expect(r.error?.issues[0]?.path).toEqual(["permuta_pct"])
    const ok = landFormSchema.parse({ ...valid, negociacao: "permuta_fisica", permuta_pct: "18" })
    expect(ok.permuta_pct).toBe(0.18)
  })

  it.each([
    [{ cep: "123" }, "cep"],
    [{ geometry: '{"type":"Point","coordinates":[0,0]}' }, "geometry"],
    [{ owner_email: "x@" }, "owner_email"],
    [{ testadas_m: "20; abc" }, "testadas_m"],
    [{ status: "" }, "status"],
  ])("rejeita %j", (patch, path) => {
    const r = landFormSchema.safeParse({ ...valid, ...patch })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === path)).toBe(true)
  })
})

describe("toLandRpcArgs", () => {
  it("separa dados, geometria e contato; zera zona automática e permuta em dinheiro", () => {
    const args = toLandRpcArgs(
      landFormSchema.parse({
        ...valid,
        zone_id: ZONE,
        negociacao: "dinheiro",
        permuta_pct: "10",
        owner_name: "Fulano",
      }),
    )
    expect(args.data.zone_id).toBeNull()
    expect(args.data.permuta_pct).toBeNull()
    expect(args.data).not.toHaveProperty("geometry")
    expect(args.geojson?.type).toBe("MultiPolygon")
    expect(args.owner).toEqual({ owner_name: "Fulano", phone: null, email: null, notes: null })
  })

  it("não envia contato vazio", () => {
    expect(toLandRpcArgs(landFormSchema.parse(valid)).owner).toBeNull()
  })
})

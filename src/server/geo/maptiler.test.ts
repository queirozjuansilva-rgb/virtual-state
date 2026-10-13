import { afterEach, describe, expect, it, vi } from "vitest"

import { candidatosDaResposta, geocodificarMapTiler } from "./maptiler"

const RESPOSTA = {
  type: "FeatureCollection",
  features: [
    {
      place_name: "Avenida Exemplo, 100 - Aldeota, Fortaleza - CE",
      center: [-38.5, -3.73],
      place_type: ["address"],
      address: "100",
      relevance: 0.98,
    },
    { place_name: "Sem coordenadas", place_type: ["poi"], relevance: 1 },
    { text: "Avenida Exemplo", center: [-38.49, -3.74], place_type: ["address"], relevance: 0.9 },
    {
      place_name: "Rua parecida em outra cidade",
      center: [-46.4, -23.5],
      place_type: ["address"],
      relevance: 0.45,
    },
  ],
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("candidatosDaResposta", () => {
  it("lê nome, ponto, tipo, número e relevância; ignora sem coordenadas e pouco relevantes", () => {
    expect(candidatosDaResposta(RESPOSTA)).toEqual([
      {
        descricao: "Avenida Exemplo, 100 - Aldeota, Fortaleza - CE",
        longitude: -38.5,
        latitude: -3.73,
        tipo: "address",
        numero: "100",
        relevancia: 0.98,
      },
      {
        descricao: "Avenida Exemplo",
        longitude: -38.49,
        latitude: -3.74,
        tipo: "address",
        numero: null,
        relevancia: 0.9,
      },
    ])
    expect(candidatosDaResposta(null)).toEqual([])
  })
})

describe("geocodificarMapTiler", () => {
  it("sem chave, devolve null sem chamar a API", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    expect(await geocodificarMapTiler("Rua A, 1")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("busca no Brasil, em português, com a origem do site", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "chave-de-teste")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.exemplo.com.br")
    const fetch = vi.fn(async () => Response.json(RESPOSTA))
    vi.stubGlobal("fetch", fetch)

    const candidatos = await geocodificarMapTiler("Av. Exemplo, 100, Fortaleza/CE")
    expect(candidatos).toHaveLength(2)

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe(
      `/geocoding/${encodeURIComponent("Av. Exemplo, 100, Fortaleza/CE")}.json`,
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: "chave-de-teste",
      country: "br",
      language: "pt",
      limit: "3",
    })
    expect(init.headers).toMatchObject({ Origin: "https://app.exemplo.com.br" })
  })

  it("erro HTTP não expõe a chave na mensagem", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "chave-secreta")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("proibido", { status: 403 })),
    )
    await expect(geocodificarMapTiler("Rua A, 1")).rejects.toThrow(/status 403/)
    await expect(geocodificarMapTiler("Rua A, 1")).rejects.not.toThrow(/chave-secreta/)
  })
})

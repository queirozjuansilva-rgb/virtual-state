import "server-only"

import type { CandidatoEndereco } from "@/lib/ai/dados"

/**
 * Geocodificação direta da MapTiler (endereço → ponto), limitada ao Brasil.
 * Usa a mesma chave do mapa. A chave pode estar restrita às origens do app no
 * painel da MapTiler; por isso o pedido vai com Origin/Referer do site.
 */

const ENDPOINT = "https://api.maptiler.com/geocoding"
const LIMITE = 3
const TEMPO_MAXIMO_MS = 8000
/** Abaixo disso a busca aproximada devolve ruas parecidas em outras cidades. */
const RELEVANCIA_MINIMA = 0.6

type FeatureMapTiler = {
  place_name?: string
  text?: string
  center?: [number, number]
  place_type?: string[]
  relevance?: number
  /** Número do imóvel (só quando o resultado chegou ao número). */
  address?: string
}

/** Converte a resposta da API em candidatos relevantes (pura; testável). */
export function candidatosDaResposta(json: unknown): CandidatoEndereco[] {
  const features = (json as { features?: FeatureMapTiler[] } | null)?.features ?? []
  return features.flatMap((f) => {
    const [longitude, latitude] = f.center ?? []
    const relevancia = f.relevance ?? 0
    if (typeof longitude !== "number" || typeof latitude !== "number") return []
    if (relevancia < RELEVANCIA_MINIMA) return []
    return [
      {
        descricao: f.place_name ?? f.text ?? "Local sem nome",
        longitude,
        latitude,
        tipo: f.place_type?.[0] ?? "desconhecido",
        numero: f.address?.trim() || null,
        relevancia,
      },
    ]
  })
}

export async function geocodificarMapTiler(endereco: string): Promise<CandidatoEndereco[] | null> {
  const chave = process.env.NEXT_PUBLIC_MAPTILER_KEY
  if (!chave) return null

  const url = new URL(`${ENDPOINT}/${encodeURIComponent(endereco.trim())}.json`)
  url.searchParams.set("key", chave)
  url.searchParams.set("country", "br")
  url.searchParams.set("language", "pt")
  url.searchParams.set("limit", String(LIMITE))
  url.searchParams.set("autocomplete", "false")

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const resposta = await fetch(url, {
    headers: { Origin: new URL(site).origin, Referer: site },
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    cache: "no-store",
  })
  if (!resposta.ok) {
    // Nunca inclua a URL (tem a chave) na mensagem.
    throw new Error(`Geocodificação da MapTiler falhou com status ${resposta.status}.`)
  }
  return candidatosDaResposta(await resposta.json())
}

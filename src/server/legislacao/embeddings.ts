import "server-only"

import { z } from "zod"

import { configIngestao, DIMENSAO_EMBEDDING, temChaveVoyage } from "./config"

/**
 * Embeddings da Voyage AI (ADR 0011), por fetch (sem SDK). "document" para os
 * trechos da lei, "query" para a pergunta do usuário. Modelos da série 4 são
 * compatíveis entre si; trocar de série exige reindexar (o modelo fica salvo
 * em legal_chunks.embedding_model).
 */

const respostaSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number().int() })),
  usage: z.object({ total_tokens: z.number().int() }),
})

/** Trechos por chamada: bem abaixo dos 1.000 itens e 320 mil tokens da API. */
export const TRECHOS_POR_CHAMADA = 64

export async function gerarEmbeddings(
  textos: readonly string[],
  tipo: "document" | "query",
): Promise<{ vetores: number[][]; tokens: number; modelo: string }> {
  const chave = process.env.VOYAGE_API_KEY
  if (!chave) throw new Error("VOYAGE_API_KEY não configurada.")
  const modelo = configIngestao.VOYAGE_MODEL
  const resposta = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: textos,
      model: modelo,
      input_type: tipo,
      output_dimension: DIMENSAO_EMBEDDING,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!resposta.ok) {
    throw new Error(`Voyage respondeu ${resposta.status}.`)
  }
  const dados = respostaSchema.parse(await resposta.json())
  const vetores = dados.data.toSorted((a, b) => a.index - b.index).map((d) => d.embedding)
  if (vetores.length !== textos.length || vetores.some((v) => v.length !== DIMENSAO_EMBEDDING)) {
    throw new Error("Voyage devolveu vetores fora do esperado.")
  }
  return { vetores, tokens: dados.usage.total_tokens, modelo }
}

/** Vetor da pergunta para a busca híbrida; null sem chave ou em falha (a busca vira só por palavras). */
export async function embeddingDaPergunta(pergunta: string): Promise<number[] | null> {
  if (!temChaveVoyage()) return null
  try {
    const { vetores } = await gerarEmbeddings([pergunta], "query")
    return vetores[0]
  } catch {
    return null
  }
}

/** Formato aceito pelo pgvector via PostgREST: "[0.1,0.2,...]". */
export function vetorParaPg(v: readonly number[]): string {
  return `[${v.join(",")}]`
}

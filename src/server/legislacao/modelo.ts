import "server-only"

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"

import { clienteAnthropic } from "@/lib/ai/config"
import { saidaExtracaoSchema, type SaidaExtracao } from "@/lib/legislacao/extracao"
import { separarPaginasOcr } from "@/lib/legislacao/ocr"

import { configIngestao, custoUsd } from "./config"
import { recortarPaginas } from "./pdf"
import { promptOcr, SISTEMA_EXTRACAO } from "./prompts"

export type Uso = { entrada: number; saida: number; custoUsd: number | null }

function somarUso(modelo: string, u: { input_tokens: number; output_tokens: number }): Uso {
  return {
    entrada: u.input_tokens,
    saida: u.output_tokens,
    custoUsd: custoUsd(modelo, u.input_tokens, u.output_tokens),
  }
}

/** Páginas por chamada de OCR: ~4 páginas cabem com folga em 16k tokens de saída. */
export const PAGINAS_POR_CHAMADA_OCR = 4

/**
 * Transcreve páginas escaneadas. O recorte do PDF vai como documento (o modelo
 * lê a imagem da página); a resposta volta separada por página.
 */
export async function transcreverPaginas(
  pdf: Uint8Array,
  paginas: readonly number[],
): Promise<{ paginas: Map<number, string>; faltando: number[]; uso: Uso; modelo: string }> {
  const modelo = configIngestao.INGESTAO_OCR_MODEL
  const recorte = await recortarPaginas(pdf, paginas)
  const resposta = await clienteAnthropic().messages.create({
    model: modelo,
    max_tokens: 16_000,
    // Transcrição não precisa de raciocínio: sem pensamento e esforço baixo.
    thinking: { type: "between_tools" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(recorte).toString("base64"),
            },
          },
          { type: "text", text: promptOcr(paginas.length) },
        ],
      },
    ],
  })
  if (resposta.stop_reason === "refusal")
    throw new Error("O modelo recusou transcrever estas páginas.")
  const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n")
  const { paginas: transcritas, faltando } = separarPaginasOcr(texto, paginas)
  // Resposta cortada no limite: as páginas finais ficam para a próxima rodada.
  return { paginas: transcritas, faltando, uso: somarUso(modelo, resposta.usage), modelo }
}

/**
 * Extração assistida com saída estruturada (schema Zod). O texto das páginas
 * vai como dado, entre marcadores; o sistema proíbe completar com memória.
 */
export async function extrairParametros(
  mensagem: string,
): Promise<{ saida: SaidaExtracao; uso: Uso; modelo: string }> {
  const modelo = configIngestao.INGESTAO_EXTRACAO_MODEL
  const stream = clienteAnthropic().messages.stream({
    model: modelo,
    max_tokens: 32_000,
    system: SISTEMA_EXTRACAO,
    output_config: { effort: "high", format: zodOutputFormat(saidaExtracaoSchema) },
    messages: [{ role: "user", content: mensagem }],
  })
  const resposta = await stream.finalMessage()
  if (resposta.stop_reason === "refusal") throw new Error("O modelo recusou a extração.")
  if (resposta.stop_reason === "max_tokens") {
    throw new Error("A resposta passou do limite de tamanho. Extraia menos páginas por vez.")
  }
  const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
  const saida = saidaExtracaoSchema.safeParse(JSON.parse(texto))
  if (!saida.success) throw new Error("A saída do modelo não seguiu o formato esperado.")
  return { saida: saida.data, uso: somarUso(modelo, resposta.usage), modelo }
}

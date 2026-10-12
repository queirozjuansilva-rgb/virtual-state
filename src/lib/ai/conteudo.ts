import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"

import type { Cartao, ItemConversa } from "./tipos"

/**
 * Mensagens do copiloto como ficam gravadas em public.messages (append-only).
 * O conteúdo do assistente é guardado exatamente como a API devolveu (blocos
 * de thinking com assinatura, blocos de fallback): reenviar igual mantém o
 * cache e o raciocínio preservado entre turnos.
 */
export type CartaoRegistrado = {
  toolUseId: string
  nome: string
  cartao?: Cartao
  terrenoId?: string
  erro?: string
}

export type MensagemRegistrada =
  | { papel: "user"; conteudo: BetaContentBlockParam[] }
  | { papel: "system"; conteudo: string }
  | {
      papel: "assistant"
      conteudo: BetaContentBlock[]
      modelo: string
      tokensEntrada: number
      tokensSaida: number
    }
  | { papel: "tool"; conteudo: BetaToolResultBlockParam[]; cartoes: CartaoRegistrado[] }

const RESULTADO_INTERROMPIDO =
  "A execução desta ferramenta foi interrompida antes de terminar. Não há resultado."

/**
 * Monta o histórico da API a partir das mensagens gravadas. Se um turno foi
 * interrompido entre a chamada de ferramenta e o resultado, completa com um
 * resultado de erro determinístico (o mesmo a cada requisição, para não
 * quebrar o prefixo).
 */
export function montarHistorico(mensagens: MensagemRegistrada[]): BetaMessageParam[] {
  const historico: BetaMessageParam[] = []
  mensagens.forEach((m, i) => {
    switch (m.papel) {
      case "user":
        historico.push({ role: "user", content: m.conteudo })
        break
      case "system":
        historico.push({ role: "system", content: m.conteudo })
        break
      case "tool":
        historico.push({ role: "user", content: m.conteudo })
        break
      case "assistant": {
        historico.push({ role: "assistant", content: m.conteudo })
        const chamadas = m.conteudo.filter((b) => b.type === "tool_use")
        const proxima = mensagens[i + 1]
        if (chamadas.length > 0 && proxima?.papel !== "tool") {
          historico.push({
            role: "user",
            content: chamadas.map((c) => ({
              type: "tool_result" as const,
              tool_use_id: c.id,
              is_error: true,
              content: RESULTADO_INTERROMPIDO,
            })),
          })
        }
        break
      }
    }
  })
  return historico
}

/** Blocos que o usuário vê: o que vem depois do último bloco de fallback. */
function blocosVisiveis(conteudo: BetaContentBlock[]): BetaContentBlock[] {
  const ultimoFallback = conteudo.findLastIndex((b) => b.type === "fallback")
  return ultimoFallback === -1 ? conteudo : conteudo.slice(ultimoFallback + 1)
}

/** Texto final do assistente numa mensagem (sem raciocínio nem notas de progresso). */
export function textoDoAssistente(conteudo: BetaContentBlock[]): string {
  return blocosVisiveis(conteudo)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
}

function textoDoUsuario(conteudo: BetaContentBlockParam[]): string {
  return conteudo
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim()
}

/** Converte as mensagens gravadas nos itens exibidos na conversa. */
export function itensDaConversa(
  mensagens: (MensagemRegistrada & { id: string; anexos?: string[] })[],
): ItemConversa[] {
  const itens: ItemConversa[] = []
  for (const m of mensagens) {
    if (m.papel === "user") {
      itens.push({
        tipo: "usuario",
        id: m.id,
        texto: textoDoUsuario(m.conteudo),
        anexos: m.anexos ?? [],
      })
    } else if (m.papel === "assistant") {
      blocosVisiveis(m.conteudo).forEach((b, i) => {
        if (b.type === "thinking" && b.thinking.trim()) {
          itens.push({ tipo: "progresso", id: `${m.id}:${i}`, texto: b.thinking.trim() })
        } else if (b.type === "text" && b.text.trim()) {
          itens.push({ tipo: "assistente", id: `${m.id}:${i}`, texto: b.text })
        }
      })
    } else if (m.papel === "tool") {
      m.cartoes.forEach((c) => {
        if (c.cartao) itens.push({ tipo: "cartao", id: `${m.id}:${c.toolUseId}`, cartao: c.cartao })
      })
    }
  }
  return itens
}

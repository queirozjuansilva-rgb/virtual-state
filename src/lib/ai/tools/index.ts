import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { z } from "zod"

import { solicitarCobertura } from "./cobertura"
import {
  ErroFerramenta,
  type ContextoFerramenta,
  type Ferramenta,
  type SaidaFerramenta,
} from "./ferramenta"
import { localizarEndereco } from "./localizacao"
import { consultarMercado } from "./mercado"
import { buscarTerrenos, obterTerreno } from "./terrenos"
import { calcularViabilidadeTerreno, compararTerrenos, estudarPonto } from "./viabilidade"
import { buscarLegislacao, consultarParametros, identificarZona } from "./zoneamento"

export { ErroFerramenta, type ContextoFerramenta, type SaidaFerramenta } from "./ferramenta"

/**
 * Ferramentas do copiloto, em ordem fixa: a lista entra no prefixo do prompt
 * (cache e thinking preservado dependem de ela não mudar entre requisições).
 */
export const FERRAMENTAS: readonly Ferramenta[] = [
  buscarTerrenos,
  obterTerreno,
  localizarEndereco,
  identificarZona,
  consultarParametros,
  buscarLegislacao,
  consultarMercado,
  calcularViabilidadeTerreno,
  compararTerrenos,
  estudarPonto,
  solicitarCobertura,
]

function esquemaJson(entrada: z.ZodObject): BetaTool.InputSchema {
  const esquema: Record<string, unknown> = z.toJSONSchema(entrada, { io: "input" })
  delete esquema.$schema
  return esquema as BetaTool.InputSchema
}

/** Definições enviadas à API. `eager_input_streaming`: a validação fica com o zod. */
export function definicoesFerramentas(): BetaTool[] {
  return FERRAMENTAS.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: esquemaJson(f.entrada),
    eager_input_streaming: true,
  }))
}

export function rotuloFerramenta(nome: string): string {
  return FERRAMENTAS.find((f) => f.nome === nome)?.rotulo ?? "Consultando dados"
}

export type ExecucaoFerramenta = { ok: true; saida: SaidaFerramenta } | { ok: false; erro: string }

/**
 * Valida a entrada (o parser tolerante do SDK pode entregar JSON truncado) e
 * executa. Erros viram mensagem para o modelo; nunca derrubam a conversa.
 */
export async function executarFerramenta(
  nome: string,
  entrada: unknown,
  ctx: ContextoFerramenta,
): Promise<ExecucaoFerramenta> {
  const f = FERRAMENTAS.find((x) => x.nome === nome)
  if (!f) {
    return {
      ok: false,
      erro: `Ferramenta desconhecida: ${nome}. Disponíveis: ${FERRAMENTAS.map((x) => x.nome).join(", ")}.`,
    }
  }
  const parsed = f.entrada.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, erro: `Entrada inválida para ${nome}:\n${z.prettifyError(parsed.error)}` }
  }
  try {
    return { ok: true, saida: await f.executar(parsed.data, ctx) }
  } catch (error) {
    if (error instanceof ErroFerramenta) return { ok: false, erro: error.message }
    console.error(`Falha na ferramenta ${nome}:`, error)
    return {
      ok: false,
      erro: "Falha técnica ao consultar os dados da plataforma. Informe o usuário e não invente o resultado.",
    }
  }
}

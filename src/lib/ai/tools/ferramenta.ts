import { z } from "zod"

import type { DadosCopiloto, TerrenoBruto } from "../dados"
import type { Cartao } from "../tipos"

/**
 * Contrato das ferramentas do copiloto (ADR 0009). Cada ferramenta valida a
 * própria entrada (zod), consulta dados só via `DadosCopiloto` e devolve:
 * - `resultado`: o JSON que o modelo lê (números crus + formatados *_fmt);
 * - `cartao`: o mesmo dado para a tela (o cartão nunca vem do texto livre);
 * - `terrenoId`: terreno a destacar no painel "Contexto do lote".
 */

/** Erro esperado (dado ausente, entrada inconsistente): vira `is_error` para o modelo. */
export class ErroFerramenta extends Error {}

export type ContextoFerramenta = { dados: DadosCopiloto }

export type SaidaFerramenta = {
  resultado: unknown
  cartao?: Cartao
  terrenoId?: string
}

export type Ferramenta<S extends z.ZodObject = z.ZodObject> = {
  nome: string
  /** Rótulo de progresso exibido enquanto a ferramenta roda. */
  rotulo: string
  descricao: string
  entrada: S
  executar(entrada: z.output<S>, ctx: ContextoFerramenta): Promise<SaidaFerramenta>
}

export function ferramenta<S extends z.ZodObject>(f: Ferramenta<S>): Ferramenta<S> {
  return f
}

// Esquemas compartilhados ------------------------------------------------------------

export const USOS = [
  "residencial_vertical",
  "residencial_horizontal",
  "comercial",
  "servicos",
  "misto",
  "industrial",
  "institucional",
] as const

export const zUso = z
  .enum(USOS)
  .describe(
    "Uso pretendido: residencial_vertical (prédio), residencial_horizontal (casas/condomínio), comercial, servicos, misto (fachada ativa), industrial ou institucional.",
  )

export const zRefTerreno = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("Código do terreno no land bank (ex.: VE-0001) ou o id retornado por outra ferramenta.")

export const zLongitude = z
  .number()
  .min(-74)
  .max(-28)
  .describe("Longitude em graus decimais (WGS84). No Brasil é negativa, ex.: -38.4980.")

export const zLatitude = z
  .number()
  .min(-34)
  .max(6)
  .describe("Latitude em graus decimais (WGS84). Ex.: Fortaleza ≈ -3.74.")

// Utilidades -----------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "ve-1", "VE 0001", "ve0001" → "VE-0001". Outros formatos passam como estão. */
export function normalizarCodigo(ref: string): string {
  const m = ref.trim().match(/^ve[\s-]?(\d{1,6})$/i)
  return m ? `VE-${m[1].padStart(4, "0")}` : ref.trim().toUpperCase()
}

export async function resolverTerreno(dados: DadosCopiloto, ref: string): Promise<TerrenoBruto> {
  const terreno = UUID.test(ref.trim())
    ? await dados.obterTerreno({ id: ref.trim() })
    : await dados.obterTerreno({ codigo: normalizarCodigo(ref) })
  if (!terreno) {
    throw new ErroFerramenta(
      `Terreno "${ref}" não encontrado no land bank (ou sem permissão de acesso). Use buscar_terrenos para ver os disponíveis.`,
    )
  }
  return terreno
}

/** Minúsculas e sem acentos, para comparar nomes digitados pelo usuário. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

/** Exige terreno OU ponto (longitude + latitude). */
export function alvoTerrenoOuPonto(entrada: {
  terreno?: string
  longitude?: number
  latitude?: number
}): { tipo: "terreno"; ref: string } | { tipo: "ponto"; longitude: number; latitude: number } {
  if (entrada.terreno) return { tipo: "terreno", ref: entrada.terreno }
  if (entrada.longitude !== undefined && entrada.latitude !== undefined) {
    return { tipo: "ponto", longitude: entrada.longitude, latitude: entrada.latitude }
  }
  throw new ErroFerramenta(
    "Informe `terreno` (código do land bank) ou `longitude` e `latitude` do ponto.",
  )
}

import { z } from "zod"

import { parseDecimal } from "@/lib/format"
import {
  AVISO_BLOQUEIO_JURIDICO,
  CODIGO_BLOQUEIO_JURIDICO,
  ORIENTACAO_BLOQUEIO_JURIDICO,
} from "@/lib/legislacao/bloqueio-juridico"

/** Estado devolvido pelas Server Actions de formulário. */
export type FormState = {
  ok?: boolean
  error?: string
  message?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Marca de tempo do sucesso; serve de `key` para limpar formulários inline. */
  savedAt?: number
}

export const initialFormState: FormState = {}

/** Converte erro do Zod em FormState com mensagens por campo. */
export function zodErrorState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { error: "Revise os campos destacados.", fieldErrors }
}

/** Erro do Postgres/PostgREST → mensagem pt-BR. */
export function dbErrorState(error: { code?: string; message: string }): FormState {
  switch (error.code) {
    case "23505":
      return { error: "Já existe um registro com esses dados (valor duplicado)." }
    case "23503":
      return {
        error: "Este registro está em uso por outro cadastro e não pode ser alterado assim.",
      }
    case "23514":
      return { error: "Algum valor está fora do intervalo permitido." }
    case "42501":
      return { error: "Você não tem permissão para esta ação." }
    case CODIGO_BLOQUEIO_JURIDICO:
      return { error: `${AVISO_BLOQUEIO_JURIDICO}. ${ORIENTACAO_BLOQUEIO_JURIDICO}` }
    case "22023": // validação de entrada nas funções do banco: a mensagem já é pt-BR
      return { error: error.message }
    default:
      return { error: `Não foi possível salvar: ${error.message}` }
  }
}

// Campos de formulário (FormData sempre traz string ou null) -----------------

/** Valor usado pelo Select para "nenhuma opção" (o Radix não aceita value vazio). */
export const EMPTY_SELECT_VALUE = "__vazio__"

const str = z.preprocess(
  (v) => (typeof v === "string" && v !== EMPTY_SELECT_VALUE ? v : ""),
  z.string(),
)

/** Texto obrigatório (trim). */
export const requiredText = (message = "Campo obrigatório.", max = 500) =>
  str.pipe(
    z
      .string()
      .trim()
      .min(1, { error: message })
      .max(max, { error: `Máximo de ${max} caracteres.` }),
  )

/** Texto opcional: string vazia vira null. */
export const optionalText = (max = 5000) =>
  str.pipe(
    z
      .string()
      .trim()
      .max(max, { error: `Máximo de ${max} caracteres.` })
      .transform((s) => (s === "" ? null : s)),
  )

type DecimalOpts = { min?: number; max?: number; integer?: boolean }

function decimalSchema(opts: DecimalOpts) {
  return z
    .number({ error: "Número inválido. Use, por exemplo, 1.200,50." })
    .refine((n) => !Number.isNaN(n), { error: "Número inválido. Use, por exemplo, 1.200,50." })
    .refine((n) => opts.min === undefined || n >= opts.min, {
      error: `Deve ser maior ou igual a ${opts.min}.`,
    })
    .refine((n) => opts.max === undefined || n <= opts.max, {
      error: `Deve ser menor ou igual a ${opts.max}.`,
    })
    .refine((n) => !opts.integer || Number.isInteger(n), { error: "Use um número inteiro." })
}

/** Número opcional em pt-BR ("1.200,50"). Vazio → null. */
export const optionalDecimal = (opts: DecimalOpts = {}) =>
  str.transform((s) => parseDecimal(s)).pipe(decimalSchema(opts).nullable())

/** Número obrigatório em pt-BR. */
export const requiredDecimal = (opts: DecimalOpts = {}, message = "Campo obrigatório.") =>
  str
    .transform((s) => parseDecimal(s))
    .pipe(z.number({ error: message }).nullable())
    .refine((n) => n !== null, { error: message })
    .pipe(decimalSchema(opts))

/** Percentual digitado (0–100) gravado como fração (0–1). Vazio → null. */
export const optionalPercentAsFraction = () =>
  optionalDecimal({ min: 0, max: 100 }).transform((n) => (n === null ? null : round(n / 100, 6)))

/** Checkbox HTML: presente ("on") → true. */
export const checkbox = () => z.preprocess((v) => v === "on" || v === "true", z.boolean())

export const optionalUuid = () =>
  str.pipe(z.union([z.literal("").transform(() => null), z.uuid({ error: "Seleção inválida." })]))

export const requiredUuid = (message = "Selecione uma opção.") =>
  str.pipe(z.uuid({ error: message }))

export const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  str.pipe(
    z.union([z.literal("").transform(() => null), z.enum(values, { error: "Opção inválida." })]),
  )

export const requiredEnum = <T extends readonly [string, ...string[]]>(
  values: T,
  message = "Selecione uma opção.",
) => str.pipe(z.enum(values, { error: message }))

export const optionalDate = () =>
  str.pipe(z.union([z.literal("").transform(() => null), z.iso.date({ error: "Data inválida." })]))

function round(n: number, digits: number) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** FormData → objeto simples (só o primeiro valor de cada chave). */
export function formDataToObject(formData: FormData): Record<string, FormDataEntryValue> {
  const out: Record<string, FormDataEntryValue> = {}
  for (const [k, v] of formData.entries()) if (!(k in out)) out[k] = v
  return out
}

import { z } from "zod"

import { RULE_FIELDS, type RuleFieldKey } from "@/lib/domain/zoning-rule-fields"
import { parseDecimal } from "@/lib/format"
import { formatFormula, tryParseFormula } from "@/lib/formula"
import type { Enums } from "@/lib/supabase/database.types"

import { localizarTrecho } from "./trechos"

/**
 * Extração assistida (ADR 0011): o modelo lê páginas da lei e devolve, por
 * zona, cada parâmetro com valor, artigo, página e trecho literal. Este módulo
 * valida a saída, normaliza os valores para as unidades do banco, confere os
 * trechos no texto das páginas e monta rascunhos de regra. Nada aqui valida
 * regra: o rascunho só alimenta o motor depois da homologação por uma pessoa.
 */

export const CAMPOS_EXTRAIVEIS = RULE_FIELDS.filter((f) => f.key !== "permitted").map(
  (f) => f.key,
) as Exclude<RuleFieldKey, "permitted">[]

type CampoExtraivel = (typeof CAMPOS_EXTRAIVEIS)[number]

const parametroSchema = z.object({
  campo: z.enum(CAMPOS_EXTRAIVEIS as [CampoExtraivel, ...CampoExtraivel[]]),
  valor_literal: z.string().describe("O valor exatamente como está escrito na lei."),
  valor_normalizado: z
    .string()
    .nullable()
    .describe(
      "Número com ponto decimal (taxas em porcentagem, sem o símbolo: 60 para 60%) ou, para recuos e outorga, expressão na sintaxe indicada.",
    ),
  artigo: z.string().describe('Dispositivo da lei: "Art. 81, V" ou "Anexo 5, Tabela 5.1".'),
  pagina: z.number().int().describe("Número da página do PDF onde está o trecho."),
  trecho: z.string().describe("Cópia literal e curta do texto da lei que sustenta o valor."),
  condicao: z
    .string()
    .nullable()
    .describe(
      "Condição ou exceção ligada ao valor, se houver (ex.: para lotes acima de 1.000 m²).",
    ),
})

export const saidaExtracaoSchema = z.object({
  zonas: z.array(
    z.object({
      codigo: z.string().describe('Sigla da zona na lei, ex.: "ZOP 1".'),
      nome: z.string(),
      uso_na_lei: z
        .string()
        .nullable()
        .describe("Nome que a lei dá ao uso-alvo, quando os parâmetros dependem do uso."),
      permitido: z.enum(["sim", "nao", "condicionado", "nao_informado"]),
      permitido_fonte: z
        .object({ artigo: z.string(), pagina: z.number().int(), trecho: z.string() })
        .nullable(),
      parametros: z.array(parametroSchema),
      observacoes: z.string().nullable(),
    }),
  ),
  observacoes_gerais: z.array(z.string()),
})

export type SaidaExtracao = z.infer<typeof saidaExtracaoSchema>
export type ParametroExtraido = z.infer<typeof parametroSchema>

const CAMPO = Object.fromEntries(RULE_FIELDS.map((f) => [f.key, f])) as Record<
  RuleFieldKey,
  (typeof RULE_FIELDS)[number]
>

/** Primeiro número de um texto em pt-BR: "125m 2" → 125 · "3,0" → 3 · "1.500" → 1500. */
function primeiroNumero(texto: string): number | null {
  const m = texto.match(/-?\d[\d.,]*/)
  if (!m) return null
  const n = parseDecimal(m[0].replace(/[.,]$/, ""))
  return n === null || Number.isNaN(n) ? null : n
}

export type ValorNormalizado = { ok: true; valor: number | string } | { ok: false; motivo: string }

export function normalizarParametro(
  campo: CampoExtraivel,
  p: Pick<ParametroExtraido, "valor_normalizado" | "valor_literal">,
): ValorNormalizado {
  const def = CAMPO[campo]
  const bruto = (p.valor_normalizado ?? "").trim()

  if (def.kind === "formula") {
    const numero = primeiroNumero(p.valor_literal)
    const candidato =
      bruto ||
      (numero !== null && /^\s*-?\d[\d.,]*\s*m?\s*$/i.test(p.valor_literal) ? String(numero) : "")
    if (!candidato)
      return { ok: false, motivo: "Sem expressão: transcreva a regra na sintaxe de fórmula." }
    const parsed = tryParseFormula(candidato)
    if (!parsed.ok) return { ok: false, motivo: `Fórmula fora do formato: ${parsed.error.message}` }
    return { ok: true, valor: formatFormula(parsed.expr) }
  }

  const numero = bruto ? primeiroNumero(bruto) : primeiroNumero(p.valor_literal)
  if (numero === null) return { ok: false, motivo: "Valor sem número." }

  if (def.kind === "percent") {
    // Taxas chegam em porcentagem (60 = 60%); "0,6" sem símbolo é fração.
    const fracao = bruto || /%/.test(p.valor_literal) || numero > 1 ? numero / 100 : numero
    if (fracao < 0 || fracao > 1) return { ok: false, motivo: "Taxa fora de 0–100%." }
    return { ok: true, valor: Number(fracao.toFixed(4)) }
  }

  const { min, max } = def as { min?: number; max?: number }
  if (def.kind === "integer" && !Number.isInteger(numero)) {
    return { ok: false, motivo: "Esperado número inteiro." }
  }
  if ((min !== undefined && numero < min) || (max !== undefined && numero > max)) {
    return { ok: false, motivo: `Fora da faixa aceita (${min ?? "−∞"} a ${max ?? "∞"}).` }
  }
  return { ok: true, valor: numero }
}

/** "ZOP 1", "ZOP-1" e "zop1" são a mesma zona. */
export function chaveZona(codigo: string): string {
  return codigo
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

export type FonteRascunho = {
  field: RuleFieldKey
  legal_document_id: string
  article: string
  excerpt: string
  page: number
  condition: string | null
  excerpt_verified: boolean
}

export type RascunhoRegra = {
  zoneId: string
  zonaCodigo: string
  values: {
    use_type: Enums<"land_use">
    use_label_local: string | null
    observacoes: string | null
  } & Partial<Record<RuleFieldKey, number | string | boolean | null>>
  sources: FonteRascunho[]
  /** O que a IA sugeriu, por campo (para medir acerto na homologação). */
  extractedValues: Partial<Record<RuleFieldKey, number | string | boolean>>
  avisos: string[]
}

export function montarRascunhos(
  saida: SaidaExtracao,
  ctx: {
    usoAlvo: Enums<"land_use">
    documentoId: string
    zonas: readonly { id: string; code: string }[]
    paginas: ReadonlyMap<number, string>
  },
): { rascunhos: RascunhoRegra[]; zonasNaoCadastradas: { codigo: string; nome: string }[] } {
  const porChave = new Map(ctx.zonas.map((z) => [chaveZona(z.code), z]))
  const rascunhos: RascunhoRegra[] = []
  const zonasNaoCadastradas: { codigo: string; nome: string }[] = []

  for (const zona of saida.zonas) {
    const cadastrada = porChave.get(chaveZona(zona.codigo))
    if (!cadastrada) {
      zonasNaoCadastradas.push({ codigo: zona.codigo, nome: zona.nome })
      continue
    }

    const avisos: string[] = []
    const values: RascunhoRegra["values"] = {
      use_type: ctx.usoAlvo,
      use_label_local: zona.uso_na_lei,
      observacoes: null,
    }
    const sources: FonteRascunho[] = []
    const extractedValues: RascunhoRegra["extractedValues"] = {}

    const fonte = (
      field: RuleFieldKey,
      f: { artigo: string; pagina: number; trecho: string },
      condicao: string | null,
    ) => {
      const achado = localizarTrecho(f.trecho, f.pagina, ctx.paginas)
      if (!achado.encontrado)
        avisos.push(
          `${CAMPO[field].label}: trecho não localizado na página ${f.pagina}. Conferir no PDF.`,
        )
      sources.push({
        field,
        legal_document_id: ctx.documentoId,
        article: f.artigo.slice(0, 200),
        excerpt: f.trecho.slice(0, 2000),
        page: achado.pagina,
        condition: condicao?.slice(0, 500) ?? null,
        excerpt_verified: achado.encontrado,
      })
    }

    if (zona.permitido !== "nao_informado") {
      values.permitted = zona.permitido !== "nao"
      extractedValues.permitted = values.permitted
      if (zona.permitido === "condicionado")
        avisos.push("Uso condicionado: conferir as condições na lei.")
      if (zona.permitido_fonte) {
        fonte(
          "permitted",
          zona.permitido_fonte,
          zona.permitido === "condicionado" ? "Uso condicionado" : null,
        )
      }
    }

    const vistos = new Set<RuleFieldKey>()
    for (const p of zona.parametros) {
      if (vistos.has(p.campo)) {
        avisos.push(
          `${CAMPO[p.campo].label}: a lei traz mais de um valor; ficou o primeiro. Conferir.`,
        )
        continue
      }
      const n = normalizarParametro(p.campo, p)
      if (!n.ok) {
        avisos.push(`${CAMPO[p.campo].label} ("${p.valor_literal}"): ${n.motivo}`)
        continue
      }
      vistos.add(p.campo)
      values[p.campo] = n.valor
      extractedValues[p.campo] = n.valor
      fonte(p.campo, p, p.condicao)
    }

    const { ca_min, ca_basico, ca_max } = values as unknown as Record<string, number | undefined>
    if (ca_min !== undefined && ca_basico !== undefined && ca_min > ca_basico) {
      avisos.push("CA mínimo maior que o básico: conferir.")
    }
    if (ca_basico !== undefined && ca_max !== undefined && ca_basico > ca_max) {
      avisos.push("CA básico maior que o máximo: conferir.")
    }

    const notas = [zona.observacoes, ...avisos].filter(Boolean)
    values.observacoes =
      notas.length > 0 ? `Notas da extração: ${notas.join(" ")}`.slice(0, 5000) : null
    rascunhos.push({
      zoneId: cadastrada.id,
      zonaCodigo: cadastrada.code,
      values,
      sources,
      extractedValues,
      avisos,
    })
  }

  return { rascunhos, zonasNaoCadastradas }
}

/**
 * Acerto da extração: dos campos que a IA sugeriu, quantos ficaram iguais na
 * regra homologada. Números comparados com tolerância de arredondamento.
 */
export function acertoDaExtracao(
  sugeridos: Partial<Record<string, unknown>>,
  homologados: Partial<Record<string, unknown>>,
): { campos: number; iguais: number; alterados: string[] } {
  const alterados: string[] = []
  const campos = Object.keys(sugeridos)
  for (const campo of campos) {
    const a = sugeridos[campo]
    const b = homologados[campo]
    const iguais =
      typeof a === "number" && typeof b === "number"
        ? Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
        : String(a) === String(b ?? "")
    if (!iguais) alterados.push(campo)
  }
  return { campos: campos.length, iguais: campos.length - alterados.length, alterados }
}

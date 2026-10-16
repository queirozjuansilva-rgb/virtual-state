import { RULE_FIELDS, type RuleFieldKey } from "@/lib/domain/zoning-rule-fields"

/**
 * Conflito de fontes (Blueprint v2.2, p. 8 e 17): ao homologar uma regra, um
 * campo cujo valor difere da regra validada atual E cuja fonte é outra norma
 * exige resolução documentada. Mesmo valor, ou mesma norma (só correção), não
 * é conflito.
 */

type Valores = Partial<Record<RuleFieldKey, unknown>>
type Fontes = Partial<Record<RuleFieldKey, { legal_document_id: string } | undefined>>

export type Conflito = {
  campo: RuleFieldKey
  atual: unknown
  novo: unknown
  documentoAtual: string
}

function iguais(a: unknown, b: unknown): boolean {
  const vazio = (v: unknown) => v === null || v === undefined || v === ""
  if (vazio(a) && vazio(b)) return true
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
  return String(a) === String(b)
}

export function conflitosDeFonte(
  nova: { valores: Valores; fontes: Fontes },
  validada: { valores: Valores; fontes: Fontes } | null,
): Conflito[] {
  if (!validada) return []
  const conflitos: Conflito[] = []
  for (const { key } of RULE_FIELDS) {
    const atual = validada.valores[key]
    const novo = nova.valores[key]
    if (iguais(atual, novo)) continue
    const docAtual = validada.fontes[key]?.legal_document_id
    const docNovo = nova.fontes[key]?.legal_document_id
    if (docAtual && docNovo && docAtual !== docNovo) {
      conflitos.push({ campo: key, atual, novo, documentoAtual: docAtual })
    }
  }
  return conflitos
}

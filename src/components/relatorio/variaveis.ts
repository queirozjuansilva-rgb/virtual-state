import type { EntradaViabilidade } from "@/lib/feasibility"
import { formatBRL, formatNumber, formatPercent, parseDecimal, toInputNumber } from "@/lib/format"
import {
  CAMPOS_EDITAVEIS,
  mesmoValor,
  valoresDaEntrada,
  type CampoEditavel,
  type ChaveEditavel,
  type Edicoes,
  type ErrosEdicao,
  type ValorCampo,
} from "@/lib/relatorio/edicao"

/** Valor de formulário: números como texto pt-BR (percentuais em 0–100). */
export type ValorFormulario = string | boolean
export type Formulario = Record<ChaveEditavel, ValorFormulario>

export function formularioDaEntrada(entrada: EntradaViabilidade): Formulario {
  const valores = valoresDaEntrada(entrada)
  const form = {} as Formulario
  for (const c of CAMPOS_EDITAVEIS) {
    const v = valores[c.chave]
    form[c.chave] =
      typeof v === "number"
        ? toInputNumber(v, c.tipo === "percentual" ? 100 : 1)
        : (v as string | boolean)
  }
  return form
}

/** Converte o formulário em edições tipadas; erros por campo para números inválidos. */
export function edicoesDoFormulario(form: Formulario): { edicoes: Edicoes; erros: ErrosEdicao } {
  const edicoes: Edicoes = {}
  const erros: ErrosEdicao = {}
  for (const c of CAMPOS_EDITAVEIS) {
    const v = form[c.chave]
    if (c.tipo === "booleano" || c.tipo === "opcao") {
      edicoes[c.chave] = v
      continue
    }
    const n = parseDecimal(String(v))
    if (n === null || Number.isNaN(n)) {
      erros[c.chave] = "Número inválido."
      continue
    }
    if (c.tipo === "meses" && !Number.isInteger(n)) {
      erros[c.chave] = "Use um número inteiro de meses."
      continue
    }
    edicoes[c.chave] = c.tipo === "percentual" ? Math.round((n / 100) * 1e6) / 1e6 : n
  }
  return { edicoes, erros }
}

/** Só as edições que diferem da entrada base (o que o usuário mudou). */
export function edicoesAlteradas(entrada: EntradaViabilidade, edicoes: Edicoes): Edicoes {
  const base = valoresDaEntrada(entrada)
  return Object.fromEntries(
    Object.entries(edicoes).filter(
      ([chave, valor]) => !mesmoValor(base[chave as ChaveEditavel], valor as ValorCampo),
    ),
  ) as Edicoes
}

/** Valor de um campo editável em pt-BR (histórico de versões). */
export function formatarValorCampo(campo: CampoEditavel, valor: ValorCampo): string {
  if (typeof valor === "boolean") return valor ? "Sim" : "Não"
  if (typeof valor === "string") return campo.opcoes?.find(([v]) => v === valor)?.[1] ?? valor
  switch (campo.tipo) {
    case "moeda":
      return formatBRL(valor)
    case "moeda_m2":
      return `${formatBRL(valor)}/m²`
    case "percentual":
      return formatPercent(valor, 2)
    case "meses":
      return `${formatNumber(valor, 0)} meses`
    default:
      return formatNumber(valor, 3)
  }
}

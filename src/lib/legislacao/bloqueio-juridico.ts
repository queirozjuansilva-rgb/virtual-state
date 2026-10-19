/**
 * Trava da homologação por pendência jurídica (migration 20261019080000, ADR 0011).
 *
 * Enquanto a vigência de uma norma está sob análise jurídica, nenhuma regra que
 * dependa dela pode ser validada; o rascunho continua livre. A trava não define
 * nenhuma lei como vigente ou revogada.
 */

/** Texto exibido no painel e devolvido ao tentar validar. */
export const AVISO_BLOQUEIO_JURIDICO = "Homologação bloqueada — vigência sob análise jurídica"

/** SQLSTATE levantado pelo gatilho do banco ao barrar a validação. */
export const CODIGO_BLOQUEIO_JURIDICO = "VEJ01"

export const ORIENTACAO_BLOQUEIO_JURIDICO =
  "Salve como rascunho. A validação volta a ser possível depois do registro do parecer jurídico."

/** Pendência jurídica aberta do município, como o copiloto a recebe. */
export type PendenciaAberta = {
  titulo: string
  /** Normas ligadas à pendência, já rotuladas (ex.: "Lei complementar nº 62/2009"). */
  normas: string[]
}

const lista = (itens: string[]) =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`

/**
 * Ressalva do copiloto (e do cartão de legislação) quando o município tem
 * pendência jurídica aberta. Nomeia as normas afetadas para não confundir com as
 * leis citadas no título da pendência. Texto para o usuário; a descrição da
 * ferramenta manda o modelo transmiti-la.
 */
export function ressalvaDeVigencia(pendencias: PendenciaAberta[]): string | null {
  if (pendencias.length === 0) return null
  return pendencias
    .map((p) => {
      const normas =
        p.normas.length > 0
          ? `Normas afetadas: ${lista([...p.normas, "as normas relacionadas a elas"])}.`
          : "Normas afetadas: as ligadas a esta pendência."
      return (
        `Vigência sob análise jurídica (${p.titulo}). ${normas} ` +
        "A aplicação dessas normas depende de parecer jurídico ainda não emitido; " +
        "não as trate como vigentes nem como revogadas."
      )
    })
    .join(" ")
}

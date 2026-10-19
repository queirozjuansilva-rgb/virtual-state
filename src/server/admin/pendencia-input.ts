import { z } from "zod"

import { checkbox, optionalText, requiredText } from "@/lib/forms"

/**
 * Formulário de encerramento de pendência jurídica (desbloqueio da homologação).
 * Sem I/O, testável. O banco repete as mesmas exigências
 * (admin_resolver_pendencia_juridica e a restrição da tabela).
 *
 * @param hoje data operacional (America/Fortaleza), "AAAA-MM-DD".
 */
export function resolucaoPendenciaSchema(hoje: string) {
  return z.object({
    parecer: requiredText("Registre a conclusão do parecer jurídico.", 8000).refine(
      (v) => v.length >= 10,
      { error: "Descreva a conclusão do parecer (ao menos 10 caracteres)." },
    ),
    responsavel: requiredText("Informe o responsável pelo parecer.", 300).refine(
      (v) => v.length >= 3,
      { error: "Informe nome e identificação do responsável (ex.: OAB)." },
    ),
    data: requiredText("Informe a data do parecer.", 10)
      .pipe(z.iso.date({ error: "Data inválida." }))
      .refine((v) => v <= hoje, { error: "A data do parecer não pode ser futura." }),
    referencia: optionalText(500),
    confirmacao: checkbox().refine((v) => v, {
      error: "Confirme que o parecer foi emitido pelo responsável indicado.",
    }),
  })
}

export function parseResolucaoPendencia(input: Record<string, unknown>, hoje: string) {
  return resolucaoPendenciaSchema(hoje).safeParse(input)
}

"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import type { ResultadoEtapa } from "@/server/legislacao/actions"

/**
 * Roda uma etapa da ingestão e, se ela devolver "restantes", chama de novo até
 * terminar (OCR e índice andam em lotes). O admin pode interromper.
 */
export function useEtapa() {
  const [pending, startTransition] = useTransition()
  const [progresso, setProgresso] = useState<string | null>(null)
  const parar = useRef(false)

  function executar(acao: () => Promise<ResultadoEtapa>, opcoes: { repetir?: boolean } = {}) {
    parar.current = false
    startTransition(async () => {
      let anterior = Number.POSITIVE_INFINITY
      for (;;) {
        const r = await acao()
        if (!r.ok) {
          toast.error(r.erro)
          setProgresso(null)
          return
        }
        const restantes = r.restantes ?? 0
        if (!opcoes.repetir || restantes === 0 || parar.current) {
          toast.success(r.mensagem)
          setProgresso(null)
          return
        }
        // Rodada sem progresso: para em vez de repetir (e gastar) para sempre.
        if (restantes >= anterior) {
          toast.warning(
            `${r.mensagem} Sem progresso nesta rodada: ${restantes} pendentes. Confira e rode de novo.`,
          )
          setProgresso(null)
          return
        }
        anterior = restantes
        setProgresso(`${r.mensagem} Faltam ${restantes}.`)
      }
    })
  }

  return {
    pending,
    progresso,
    executar,
    interromper: () => {
      parar.current = true
    },
  }
}

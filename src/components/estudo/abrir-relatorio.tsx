"use client"

import { FileText, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { criarRelatorio } from "@/server/relatorios/actions"

/** Cria (ou reabre) o relatório interativo de um estudo registrado. */
export function AbrirRelatorio({
  analysisRunId,
  size = "sm",
}: {
  analysisRunId: string
  size?: "sm" | "xs"
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await criarRelatorio(analysisRunId)
          if (r.ok) router.push(`/relatorios/${r.id}`)
          else toast.error(r.erro)
        })
      }
    >
      {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
      Abrir relatório
    </Button>
  )
}

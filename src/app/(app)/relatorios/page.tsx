import { FileText, FlaskConical, Link2, TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/lib/auth/dal"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { listarRelatorios } from "@/server/relatorios/queries"

export const metadata: Metadata = { title: "Relatórios" }

export default function RelatoriosPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Relatórios"
        description="Estudos de viabilidade salvos pela sua organização. Abra um estudo no chat ou no Land Bank e use “Abrir relatório”."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Lista />
      </Suspense>
    </PageContainer>
  )
}

async function Lista() {
  await requireUser()
  const relatorios = await listarRelatorios(await createClient())
  if (relatorios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        <FileText className="size-8 text-brand/60" aria-hidden />
        <p className="font-medium text-foreground">Nenhum relatório ainda.</p>
        <p>Peça um estudo de viabilidade ao copiloto e clique em “Abrir relatório”.</p>
      </div>
    )
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {relatorios.map((r) => (
        <li key={r.id}>
          <Link
            href={`/relatorios/${r.id}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50"
          >
            <FileText className="size-4 text-brand" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{r.titulo}</span>
            {r.dadosDeTeste && (
              <Badge
                variant="outline"
                className="text-violet-700 dark:text-violet-300"
                title="Terreno fictício ou arquivado: só administradores veem este relatório."
              >
                <FlaskConical aria-hidden /> Dados de teste
              </Badge>
            )}
            {r.desatualizado && (
              <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                <TriangleAlert aria-hidden /> Desatualizado
              </Badge>
            )}
            {r.compartilhado && (
              <Badge variant="outline" className="text-muted-foreground">
                <Link2 aria-hidden /> Compartilhado
              </Badge>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              Versão {r.versaoAtual} · atualizado em {formatDateTime(r.atualizadoEm)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { RelatorioEditor } from "@/components/relatorio/relatorio-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/lib/auth/dal"
import { createClient } from "@/lib/supabase/server"
import { carregarRelatorio } from "@/server/relatorios/queries"

export const metadata: Metadata = { title: "Relatório" }

export default function RelatorioPage({ params, searchParams }: PageProps<"/relatorios/[id]">) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
      <Suspense fallback={<RelatorioCarregando />}>
        <Relatorio params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Relatorio({
  params,
  searchParams,
}: Pick<PageProps<"/relatorios/[id]">, "params" | "searchParams">) {
  const { id } = await params
  const { versao } = await searchParams
  if (!z.uuid().safeParse(id).success) notFound()
  const numero = z.coerce.number().int().positive().safeParse(versao)

  const user = await requireUser()
  const relatorio = await carregarRelatorio(
    await createClient(),
    id,
    numero.success ? numero.data : undefined,
  )
  if (!relatorio) notFound()
  return (
    <RelatorioEditor
      key={relatorio.versao.id}
      relatorio={relatorio}
      podeRevisar={user.role === "analista" || user.role === "admin"}
    />
  )
}

function RelatorioCarregando() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  )
}

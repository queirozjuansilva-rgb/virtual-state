import { FileDown } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { Logo } from "@/components/brand/logo"
import { RelatorioConteudo } from "@/components/relatorio/relatorio-conteudo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/server"
import { carregarCompartilhado } from "@/server/relatorios/compartilhado"

export const metadata: Metadata = {
  title: "Relatório compartilhado",
  robots: { index: false, follow: false },
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

/** Link somente leitura: última versão salva, sem login. */
export default function RelatorioCompartilhadoPage({ params }: PageProps<"/r/[token]">) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Logo />
          <span className="text-xs text-muted-foreground">
            Relatório compartilhado · somente leitura
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <Conteudo params={params} />
        </Suspense>
      </main>
    </div>
  )
}

async function Conteudo({ params }: Pick<PageProps<"/r/[token]">, "params">) {
  const { token } = await params
  const relatorio = await carregarCompartilhado(await createClient(), token)
  if (!relatorio) notFound()
  const { versao } = relatorio
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{relatorio.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {relatorio.organizacao} · versão {versao.versao}, salva em{" "}
            {dataHora.format(new Date(versao.salvaEm))} · motor de viabilidade v{versao.versaoMotor}
            {relatorio.terreno?.ficticio ? " · dados fictícios" : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/r/${token}/pdf`} download>
            <FileDown aria-hidden /> Baixar PDF
          </a>
        </Button>
      </div>
      <RelatorioConteudo
        entrada={versao.entrada}
        resultado={versao.resultado}
        contexto={relatorio.contexto}
        terreno={relatorio.terreno}
      />
    </>
  )
}

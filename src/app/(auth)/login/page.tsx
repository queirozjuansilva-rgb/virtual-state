import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { LoginForms } from "@/components/auth/login-forms"
import { Skeleton } from "@/components/ui/skeleton"
import { safeNextPath } from "@/lib/auth/schemas"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse sua conta para analisar terrenos.</p>
      </header>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>

      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Cadastre-se
        </Link>
      </p>
    </div>
  )
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams
  return <LoginForms next={safeNextPath(params.next)} linkError={params.erro === "link"} />
}

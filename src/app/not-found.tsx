import type { Metadata } from "next"
import Link from "next/link"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Página não encontrada" }

/** 404 do app (inclui links compartilhados inválidos ou desativados). */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O endereço não existe, você não tem acesso a ele ou o link compartilhado foi desativado.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Ir para o início</Link>
      </Button>
    </main>
  )
}

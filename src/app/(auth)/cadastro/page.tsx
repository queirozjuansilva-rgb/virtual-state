import type { Metadata } from "next"
import Link from "next/link"

import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = { title: "Criar conta" }

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Para incorporadoras, construtoras e investidores.
        </p>
      </header>

      <SignupForm />

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}

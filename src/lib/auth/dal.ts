import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

import type { AppRole } from "./roles"

/** Visão mínima do usuário que pode chegar a componentes. */
export type CurrentUser = {
  id: string
  email: string
  fullName: string | null
  role: AppRole
}

/**
 * Data Access Layer: único ponto que lê a sessão. Lê request data (cookies),
 * então quem chamar precisa estar dentro de um <Suspense>.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", claims.sub)
    .maybeSingle()

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? "membro",
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

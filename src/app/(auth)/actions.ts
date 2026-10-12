"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { authErrorMessage } from "@/lib/auth/errors"
import { loginSchema, magicLinkSchema, safeNextPath, signupSchema } from "@/lib/auth/schemas"
import { publicEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export type AuthFormState = {
  error?: string
  message?: string
  /** Erros por campo, para exibir sob cada input. */
  fieldErrors?: Record<string, string[] | undefined>
  /** Valores enviados, para repovoar o formulário após erro. */
  values?: Record<string, string>
}

function formValues(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]))
}

/** URL de retorno dos e-mails. Usa a origem da requisição (funciona em previews). */
async function callbackUrl(next: string) {
  const origin = (await headers()).get("origin") ?? publicEnv.NEXT_PUBLIC_SITE_URL
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = formValues(formData, ["email"])
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: authErrorMessage(error.code), values }

  redirect(safeNextPath(formData.get("next")))
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = formValues(formData, ["fullName", "email"])
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: await callbackUrl("/"),
    },
  })
  if (error) return { error: authErrorMessage(error.code), values }

  // Com confirmação de e-mail desligada, o Supabase já devolve a sessão.
  if (data.session) redirect("/")

  return {
    message: `Enviamos um link de confirmação para ${parsed.data.email}. Abra o e-mail para ativar sua conta.`,
  }
}

export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = formValues(formData, ["email"])
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Cadastro aberto no MVP: o link também cria a conta se ela não existir.
      shouldCreateUser: true,
      emailRedirectTo: await callbackUrl(safeNextPath(formData.get("next"))),
    },
  })
  if (error) return { error: authErrorMessage(error.code), values }

  return {
    message: `Enviamos um link de acesso para ${parsed.data.email}. Abra-o neste mesmo navegador.`,
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

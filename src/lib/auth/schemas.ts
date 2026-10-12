import { z } from "zod"

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Informe um e-mail válido." }))

const password = z
  .string()
  .min(8, { error: "A senha precisa ter pelo menos 8 caracteres." })
  .max(72, { error: "A senha pode ter no máximo 72 caracteres." })

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Informe a senha." }),
})

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Informe seu nome." })
    .max(120, { error: "Nome muito longo." }),
  email,
  password,
})

export const magicLinkSchema = z.object({ email })

/**
 * Aceita só caminhos internos ("/x"), para o parâmetro `next` não virar
 * open redirect ("//evil.com", "https://...", "/\evil.com").
 */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}

import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { connection } from "next/server"

import { publicEnv } from "@/lib/env"

import type { Database } from "./database.types"

/** Cliente por requisição. Nunca compartilhe entre requisições. */
export async function createClient() {
  // A sessão é validada contra o relógio (expiração do JWT): isso só pode
  // rodar no request, nunca num prerender/prefetch.
  await connection()
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Chamado de um Server Component, onde não dá para escrever cookies.
            // O proxy (src/proxy.ts) já renova a sessão a cada navegação.
          }
        },
      },
    },
  )
}

import { z } from "zod"

/**
 * Variáveis públicas (expostas ao navegador). Referenciadas uma a uma porque o
 * Next só faz inline de `process.env.NEXT_PUBLIC_*` com acesso estático.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // Opcional: sem chave, o mapa usa tiles públicos do OSM (só para desenvolvimento).
  NEXT_PUBLIC_MAPTILER_KEY: z.string().min(1).optional(),
})

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_MAPTILER_KEY: process.env.NEXT_PUBLIC_MAPTILER_KEY || undefined,
})

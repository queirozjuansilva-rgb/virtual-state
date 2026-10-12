import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { publicEnv } from "@/lib/env"

/** Rotas acessíveis sem sessão. */
const PUBLIC_PATHS = ["/login", "/cadastro", "/auth"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Renova a sessão do Supabase e escreve os cookies atualizados na resposta.
 * Também redireciona visitantes sem sessão para /login (checagem otimista;
 * a autorização de verdade acontece perto dos dados, via DAL + RLS).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Não coloque código entre createServerClient e getClaims: getClaims valida
  // o JWT e dispara o refresh quando necessário.
  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  if (!isAuthenticated && !isPublic(pathname)) {
    // Rotas de API respondem 401 em vez de redirecionar (o cliente é um fetch).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Sua sessão expirou. Entre de novo." }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`
    return redirectWithCookies(url, response)
  }

  if (isAuthenticated && (pathname === "/login" || pathname === "/cadastro")) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return redirectWithCookies(url, response)
  }

  return response
}

/** Redireciona preservando os cookies de sessão já renovados. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type Crumb = { label: string; href?: string }

const ADMIN: Crumb = { label: "Administração" }
const LAND_BANK: Crumb = { label: "Land Bank", href: "/admin/terrenos" }
const MUNICIPIOS: Crumb = { label: "Municípios", href: "/admin/municipios" }

/** Trilha a partir da rota. Rotas dinâmicas recebem um rótulo genérico. */
export function crumbsFor(pathname: string): Crumb[] {
  const p = pathname.replace(/\/+$/, "") || "/"
  const routes: [RegExp, Crumb[]][] = [
    [/^\/$/, [{ label: "Painel" }, { label: "Nova análise" }]],
    [/^\/chat\/[^/]+$/, [{ label: "Painel", href: "/" }, { label: "Análise" }]],
    [/^\/perfil$/, [{ label: "Perfil do investidor" }]],
    [/^\/admin\/terrenos$/, [ADMIN, { label: "Land Bank" }]],
    [/^\/admin\/terrenos\/novo$/, [ADMIN, LAND_BANK, { label: "Novo terreno" }]],
    [/^\/admin\/terrenos\/[^/]+$/, [ADMIN, LAND_BANK, { label: "Terreno" }]],
    [/^\/admin\/municipios$/, [ADMIN, { label: "Municípios" }]],
    [/^\/admin\/municipios\/[^/]+$/, [ADMIN, MUNICIPIOS, { label: "Município" }]],
    [/^\/admin\/zonas\/nova$/, [ADMIN, MUNICIPIOS, { label: "Nova zona" }]],
    [/^\/admin\/zonas\/[^/]+$/, [ADMIN, MUNICIPIOS, { label: "Zona" }]],
    [/^\/admin\/zonas\/[^/]+\/regras\/nova$/, [ADMIN, MUNICIPIOS, { label: "Nova regra" }]],
    [/^\/admin\/regras\/[^/]+$/, [ADMIN, MUNICIPIOS, { label: "Regra urbanística" }]],
  ]
  return routes.find(([re]) => re.test(p))?.[1] ?? [{ label: "Painel" }]
}

export function HeaderBreadcrumb() {
  const crumbs = crumbsFor(usePathname())
  return (
    <nav aria-label="Trilha" className="min-w-0">
      <ol className="flex items-center gap-2 truncate text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-muted-foreground" aria-hidden>
                  /
                </span>
              )}
              {c.href && !last ? (
                <Link href={c.href} className="text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={last ? "font-semibold" : "text-muted-foreground"}
                  aria-current={last ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

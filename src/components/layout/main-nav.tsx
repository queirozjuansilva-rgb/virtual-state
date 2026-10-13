"use client"

import { FileText } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

function Itens({ ativo }: { ativo: boolean }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={ativo}>
              <Link href="/relatorios" aria-current={ativo ? "page" : undefined}>
                <FileText aria-hidden />
                <span>Relatórios</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Navegação principal do membro (além do chat). Use dentro de <Suspense>. */
export function MainNav() {
  const pathname = usePathname()
  return <Itens ativo={pathname === "/relatorios" || pathname.startsWith("/relatorios/")} />
}

/** Mesmo menu sem o estado ativo, para o fallback do <Suspense>. */
export function MainNavFallback() {
  return <Itens ativo={false} />
}

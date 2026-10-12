import { MessageSquarePlus } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { Logo } from "@/components/brand/logo"
import { UserMenu } from "@/components/layout/user-menu"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/auth/dal"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="gap-4 p-4">
        <Logo tagline />
        <Button asChild size="lg" className="w-full">
          <Link href="/">
            <MessageSquarePlus aria-hidden />
            Novo chat
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Análises recentes</SidebarGroupLabel>
          <SidebarGroupContent>
            {/* Histórico de conversas entra na Fase 3. */}
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma análise ainda.</p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
          <SidebarUser />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

async function SidebarUser() {
  const user = await getCurrentUser()
  if (!user) return null
  return <UserMenu user={user} />
}

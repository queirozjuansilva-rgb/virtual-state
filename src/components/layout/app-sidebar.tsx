import { MessageSquarePlus } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { Logo } from "@/components/brand/logo"
import { AdminNav } from "@/components/layout/admin-nav"
import { ConversasRecentes } from "@/components/layout/conversas-recentes"
import { MainNav, MainNavFallback } from "@/components/layout/main-nav"
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
        <Suspense fallback={<MainNavFallback />}>
          <MainNav />
        </Suspense>
        <SidebarGroup>
          <SidebarGroupLabel>Análises recentes</SidebarGroupLabel>
          <SidebarGroupContent>
            <Suspense fallback={<SidebarMenuSkeleton />}>
              <ConversasRecentes />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
        <Suspense fallback={null}>
          <SidebarAdminNav />
        </Suspense>
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

async function SidebarAdminNav() {
  const user = await getCurrentUser()
  return user?.role === "admin" ? <AdminNav /> : null
}

async function SidebarUser() {
  const user = await getCurrentUser()
  if (!user) return null
  return <UserMenu user={user} />
}

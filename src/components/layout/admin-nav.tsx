"use client"

import { Landmark, LandPlot } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const ITEMS = [
  { href: "/admin/terrenos", label: "Land Bank", icon: LandPlot, match: ["/admin/terrenos"] },
  {
    href: "/admin/municipios",
    label: "Municípios e zoneamento",
    icon: Landmark,
    match: ["/admin/municipios", "/admin/zonas", "/admin/regras"],
  },
] as const

export function AdminNav() {
  const pathname = usePathname()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Administração</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {ITEMS.map(({ href, label, icon: Icon, match }) => {
            const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`))
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link href={href} aria-current={active ? "page" : undefined}>
                    <Icon aria-hidden />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

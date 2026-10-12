import { Suspense } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

/**
 * Shell autenticado. O proxy já redireciona quem não tem sessão; a leitura do
 * usuário fica dentro de <Suspense> (AppSidebar) para não bloquear o shell.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" aria-label="Alternar menu lateral" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Suspense fallback={null}>
            <HeaderBreadcrumb />
          </Suspense>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

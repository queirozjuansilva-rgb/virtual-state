import { AppSidebar } from "@/components/layout/app-sidebar"
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
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" aria-label="Alternar menu lateral" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <nav aria-label="Trilha" className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Painel</span>
            <span className="text-muted-foreground" aria-hidden>
              /
            </span>
            <span className="font-semibold">Nova análise</span>
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

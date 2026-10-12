import { Logo } from "@/components/brand/logo"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Painel de marca, alinhado ao visual do pitch (fundo escuro + esferas ciano/petróleo). */}
      <aside className="brand-panel relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span className="text-sm font-semibold tracking-wider uppercase opacity-80">
          Transformando dados em decisões de lucro
        </span>
        <div className="relative max-w-md space-y-4">
          <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight">virtual.estate</h1>
          <p className="text-lg text-white/80">
            Copiloto de inteligência para triagem técnica de terrenos e estudo de viabilidade
            preliminar.
          </p>
          <p className="text-sm text-white/60">
            Não substituímos o seu veredito: automatizamos a sua triagem.
          </p>
        </div>
        <span className="text-xs text-white/50">Mercadológico · Urbanístico · Físico</span>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <Logo className="lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  )
}

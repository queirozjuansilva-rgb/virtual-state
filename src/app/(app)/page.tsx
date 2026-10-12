import {
  FileText,
  Landmark,
  MapPin,
  Paperclip,
  SendHorizontal,
  TrendingUp,
  Trees,
} from "lucide-react"
import type { Metadata } from "next"

import { Button } from "@/components/ui/button"
import { ENGINE_VERSION } from "@/lib/feasibility/version"

export const metadata: Metadata = { title: "Nova análise" }

const SHORTCUTS = [
  {
    icon: Landmark,
    title: "Consulta de zoneamento",
    description:
      "Recuos, gabarito, coeficiente de aproveitamento e taxa de ocupação, com lei e artigo.",
  },
  {
    icon: TrendingUp,
    title: "Análise de mercado",
    description: "Preço de venda por m² de comparáveis na região e velocidade de vendas.",
  },
  {
    icon: Trees,
    title: "Restrições ambientais",
    description: "APP, área alagável, zona de proteção ambiental e faixa não edificável.",
  },
  {
    icon: FileText,
    title: "Relatório de viabilidade",
    description: "Estudo preliminar com cenários, premissas e fontes, exportável em PDF.",
  },
] as const

const QUICK_ACTIONS = ["Verificar recuos", "Estudo de densidade", "Taxa de ocupação"] as const

export default function NewAnalysisPage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-brand">
            <Landmark className="size-8" aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Bem-vindo à virtual.estate</h1>
            <p className="text-lg text-muted-foreground">
              Pronto para analisar seu próximo projeto? Faça a triagem técnica de um terreno em
              segundos.
            </p>
          </div>

          <ul className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {SHORTCUTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="rounded-xl border bg-card p-4 text-left shadow-xs">
                <Icon className="mb-2 size-5 text-brand" aria-hidden />
                <p className="mb-1 text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Compositor do chat: fica inativo até o copiloto (Fase 3). */}
      <div className="px-4 pt-2 pb-6 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border bg-card p-2 shadow-lg shadow-black/5">
            <div className="flex items-center gap-1 px-1 pt-1">
              <Button variant="ghost" size="icon" disabled aria-label="Anexar documento">
                <Paperclip aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" disabled aria-label="Selecionar localização">
                <MapPin aria-hidden />
              </Button>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <span className="px-1 text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Motor de viabilidade v{ENGINE_VERSION}
              </span>
            </div>
            <div className="flex items-end gap-3 px-2 pb-1">
              <label htmlFor="prompt" className="sr-only">
                Mensagem para o copiloto
              </label>
              <textarea
                id="prompt"
                rows={1}
                disabled
                placeholder="Copiloto em breve: digite um endereço ou pergunte sobre o zoneamento de um terreno…"
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <Button size="icon-lg" disabled aria-label="Enviar mensagem">
                <SendHorizontal aria-hidden />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
              Ações rápidas:
            </span>
            {QUICK_ACTIONS.map((label) => (
              <Button key={label} variant="secondary" size="xs" disabled>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

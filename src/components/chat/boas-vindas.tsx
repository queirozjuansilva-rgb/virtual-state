import { FileText, Landmark, TrendingUp, Trees } from "lucide-react"

const ATALHOS = [
  {
    icon: Landmark,
    title: "Consulta de zoneamento",
    description:
      "Recuos, gabarito, coeficiente de aproveitamento e taxa de ocupação, com lei e artigo.",
  },
  {
    icon: TrendingUp,
    title: "Análise de mercado",
    description: "Preço de venda por m² de comparáveis na região e CUB de referência.",
  },
  {
    icon: Trees,
    title: "Restrições ambientais",
    description: "APP, área alagável, zona de proteção ambiental e faixa não edificável.",
  },
  {
    icon: FileText,
    title: "Estudo de viabilidade",
    description: "VGV, margem, TIR, cenários e risco, com a fonte de cada premissa.",
  },
] as const

/** Tela inicial de uma nova análise. */
export function BoasVindas({ configurado }: { configurado: boolean }) {
  return (
    <section className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:px-8">
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
        {!configurado && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
            O copiloto ainda não está configurado neste ambiente (chave da Anthropic ausente).
          </p>
        )}
        <ul className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {ATALHOS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="rounded-xl border bg-card p-4 text-left shadow-xs">
              <Icon className="mb-2 size-5 text-brand" aria-hidden />
              <p className="mb-1 text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

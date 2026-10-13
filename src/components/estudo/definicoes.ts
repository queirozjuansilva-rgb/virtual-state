import type { Limitante, NivelRisco } from "@/lib/feasibility"

/** Definições das métricas (tooltips) e rótulos comuns aos estudos. */
export const DEFINICOES = {
  margem: "Margem líquida = lucro ÷ VGV total (inclui unidades de permuta física).",
  roi: "ROI = lucro ÷ exposição máxima de caixa (o capital que precisa ser aportado).",
  tir: "TIR anual equivalente à taxa interna do fluxo de caixa mensal.",
  payback: "Mês em que o caixa acumulado volta a ficar positivo (nominal).",
  exposicao: "Maior saldo negativo acumulado do fluxo: o aporte máximo necessário.",
} as const

export const LIMITANTE: Record<Limitante, string> = {
  coeficiente_aproveitamento: "coeficiente de aproveitamento",
  taxa_ocupacao: "taxa de ocupação",
  recuos: "recuos",
  gabarito: "gabarito",
}

export const NIVEL: Record<NivelRisco, { rotulo: string; classe: string }> = {
  baixo: { rotulo: "Risco baixo", classe: "border-transparent bg-accent text-accent-foreground" },
  medio: {
    rotulo: "Risco médio",
    classe: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  alto: {
    rotulo: "Risco alto",
    classe: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

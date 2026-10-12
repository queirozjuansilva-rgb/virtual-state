import { CircleCheck, FilePen, FlaskConical, Archive } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { COVERAGE_STATUS, LAND_STATUS, RULE_STATUS } from "@/lib/domain/labels"
import type { Enums } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

const LAND_STATUS_STYLE: Record<Enums<"land_status">, string> = {
  disponivel: "border-transparent bg-accent text-accent-foreground",
  em_negociacao: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  reservado: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  vendido: "border-border bg-muted text-muted-foreground",
  indisponivel: "border-border bg-muted text-muted-foreground",
}

export function LandStatusBadge({ status }: { status: Enums<"land_status"> }) {
  return (
    <Badge variant="outline" className={LAND_STATUS_STYLE[status]}>
      {LAND_STATUS[status]}
    </Badge>
  )
}

export function RuleStatusBadge({ status }: { status: Enums<"rule_status"> }) {
  const Icon = status === "validado" ? CircleCheck : status === "rascunho" ? FilePen : Archive
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "validado" && "border-transparent bg-accent text-accent-foreground",
        status === "rascunho" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        status === "arquivado" && "text-muted-foreground",
      )}
    >
      <Icon aria-hidden />
      {RULE_STATUS[status]}
    </Badge>
  )
}

export function CoverageBadge({ status }: { status: Enums<"coverage_status"> }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "coberto" && "border-transparent bg-accent text-accent-foreground",
        status === "em_implantacao" &&
          "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
      )}
    >
      {COVERAGE_STATUS[status]}
    </Badge>
  )
}

/** Selo para dados de teste (seed), que nunca devem ir para relatório real. */
export function FictitiousBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <FlaskConical aria-hidden />
      Fictício
    </Badge>
  )
}

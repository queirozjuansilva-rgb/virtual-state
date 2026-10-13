"use client"

import { Info } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function Kpi({
  rotulo,
  valor,
  definicao,
  negativo,
}: {
  rotulo: string
  valor: string
  definicao?: string
  negativo?: boolean
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo}
        {definicao && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`O que é ${rotulo}`} className="rounded-full">
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{definicao}</TooltipContent>
          </Tooltip>
        )}
      </dt>
      <dd className={cn("text-lg font-semibold tabular-nums", negativo && "text-destructive")}>
        {valor}
      </dd>
    </div>
  )
}

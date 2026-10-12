import { Building2 } from "lucide-react"

import { cn } from "@/lib/utils"

export function Logo({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="size-4.5" aria-hidden />
        </span>
        <span className="text-lg font-bold tracking-tight">virtual.estate</span>
      </div>
      {tagline && (
        <span className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Viabilidade de terrenos com IA
        </span>
      )}
    </div>
  )
}

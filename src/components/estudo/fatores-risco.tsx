import { TriangleAlert } from "lucide-react"

import type { Risco } from "@/lib/feasibility"

/** Flags do score de risco (ADR 0008): nunca só a palavra "Baixo". */
export function FatoresRisco({ risco }: { risco: Risco }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Fatores de risco (score {risco.score} de 100)</h4>
      {risco.flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma flag disparou.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {risco.flags.map((f) => (
            <li key={f.codigo} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                <strong>{f.rotulo}</strong> (+{f.peso}): {f.detalhe}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

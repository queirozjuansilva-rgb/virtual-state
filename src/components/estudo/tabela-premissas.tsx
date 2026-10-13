import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { PremissaUsada } from "@/lib/feasibility"
import { formatarFonte, formatarValorPremissa } from "@/lib/format/fonte"
import { cn } from "@/lib/utils"

/** Premissas efetivamente usadas, cada uma com a origem (princípio 3 do PRD). */
export function TabelaPremissas({
  premissas,
  destacadas = [],
}: {
  premissas: PremissaUsada[]
  /** Chaves ajustadas pelo usuário, realçadas. */
  destacadas?: readonly string[]
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Premissa</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Fonte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {premissas.map((p) => (
            <TableRow key={p.chave} className={cn(destacadas.includes(p.chave) && "bg-accent/40")}>
              <TableCell>{p.rotulo}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatarValorPremissa(p)}
              </TableCell>
              <TableCell className="text-xs whitespace-normal text-muted-foreground">
                {formatarFonte(p.fonte)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

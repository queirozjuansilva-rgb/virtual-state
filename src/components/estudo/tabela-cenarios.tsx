import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResultadoViabilidade } from "@/lib/feasibility"
import { linhasCenarios, notaCenarios } from "@/lib/relatorio/secoes"

export function TabelaCenarios({ cenarios }: { cenarios: ResultadoViabilidade["cenarios"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Indicador</TableHead>
            <TableHead className="text-right">Conservador</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Otimista</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhasCenarios(cenarios).map((l) => (
            <TableRow key={l.indicador}>
              <TableCell>{l.indicador}</TableCell>
              <TableCell className="text-right tabular-nums">{l.conservador}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{l.base}</TableCell>
              <TableCell className="text-right tabular-nums">{l.otimista}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">{notaCenarios(cenarios)}</p>
    </div>
  )
}

import { Plus, TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { FictitiousBadge, LandStatusBadge } from "@/components/admin/badges"
import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatArea, formatBRL } from "@/lib/format"
import { listLands } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Land Bank" }

async function LandsPageContent() {
  const lands = await listLands()

  return (
    <PageContainer>
      <PageHeader
        title="Land Bank"
        description="Terrenos captados. Membros veem apenas os disponíveis; contato do proprietário é só do admin."
        actions={
          <Button asChild>
            <Link href="/admin/terrenos/novo">
              <Plus aria-hidden /> Novo terreno
            </Link>
          </Button>
        }
      />

      {lands.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum terreno cadastrado ainda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead className="text-right">Área</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Preço pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lands.map((land) => (
                <TableRow key={land.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/terrenos/${land.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {land.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{land.address}</span>
                      {land.is_fictitious && <FictitiousBadge />}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {[
                        land.neighborhood,
                        land.municipality && `${land.municipality.name}/${land.municipality.uf}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatArea(land.area_m2)}
                  </TableCell>
                  <TableCell>
                    <ZoneCell
                      code={land.zone?.code ?? null}
                      overlap={land.zones_overlap_count}
                      manual={land.zone_assignment === "manual"}
                    />
                  </TableCell>
                  <TableCell>
                    <LandStatusBadge status={land.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(land.preco_pedido, { compact: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}

function ZoneCell({
  code,
  overlap,
  manual,
}: {
  code: string | null
  overlap: number
  manual: boolean
}) {
  if (!code) {
    return (
      <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300">
        <TriangleAlert className="size-3.5" aria-hidden /> Não identificada
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {code}
      {manual && <span className="text-xs text-muted-foreground">(manual)</span>}
      {overlap > 1 && (
        <span
          className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300"
          title={`O lote cruza ${overlap} zonas`}
        >
          <TriangleAlert className="size-3.5" aria-hidden /> {overlap} zonas
        </span>
      )}
    </span>
  )
}

export default function LandsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <LandsPageContent />
    </Suspense>
  )
}

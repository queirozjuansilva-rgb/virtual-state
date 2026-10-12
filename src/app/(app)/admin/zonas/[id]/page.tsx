import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { RuleStatusBadge } from "@/components/admin/badges"
import { PageContainer, PageHeader, Section } from "@/components/admin/page-header"
import { ZoneForm } from "@/components/admin/zone-form"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LAND_USE } from "@/lib/domain/labels"
import { formatMeters, formatNumber, formatPercent } from "@/lib/format"
import { saveZone } from "@/server/admin/actions"
import { getZone, listLegalDocuments, listRules, listZones } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Zona" }

const count = (rel: { count: number }[] | null | undefined) => rel?.[0]?.count ?? 0

async function ZonePageContent({ params }: PageProps<"/admin/zonas/[id]">) {
  const { id } = await params
  const zone = await getZone(id)
  const [documents, zones, rules] = await Promise.all([
    listLegalDocuments(zone.municipality_id),
    listZones(zone.municipality_id),
    listRules(id),
  ])
  const municipality = Array.isArray(zone.municipality) ? zone.municipality[0] : zone.municipality

  return (
    <PageContainer>
      <PageHeader
        title={`${zone.code}: ${zone.name}`}
        description={
          municipality ? (
            <Link
              href={`/admin/municipios/${municipality.id}`}
              className="underline-offset-4 hover:underline"
            >
              {municipality.name}/{municipality.uf}
            </Link>
          ) : undefined
        }
      />

      <Section
        title="Regras por uso"
        description="Só regras validadas alimentam o motor de viabilidade. Cada parâmetro validado cita lei e artigo."
        actions={
          <Button asChild size="sm">
            <Link href={`/admin/zonas/${id}/regras/nova`}>
              <Plus aria-hidden /> Nova regra
            </Link>
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uso</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">CA básico / máx.</TableHead>
                <TableHead className="text-right">TO</TableHead>
                <TableHead className="text-right">Gabarito</TableHead>
                <TableHead>Recuos (fr. / lat. / fundos)</TableHead>
                <TableHead className="text-right">Fontes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Nenhuma regra cadastrada para esta zona.
                  </TableCell>
                </TableRow>
              )}
              {rules.map((r) => (
                <TableRow
                  key={r.id}
                  className={r.status === "arquivado" ? "opacity-60" : undefined}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/regras/${r.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {LAND_USE[r.use_type]}
                    </Link>
                    {!r.permitted && (
                      <span className="block text-xs text-muted-foreground">Uso não permitido</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RuleStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.permitted ? `${formatNumber(r.ca_basico)} / ${formatNumber(r.ca_max)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(r.to_max)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.gabarito_m !== null ? formatMeters(r.gabarito_m) : "—"}
                    {r.gabarito_pavimentos !== null && (
                      <span className="block text-xs text-muted-foreground">
                        {r.gabarito_pavimentos} pav.
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {[r.recuo_frontal, r.recuo_lateral, r.recuo_fundos]
                      .map((v) => v ?? "—")
                      .join(" / ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{count(r.rule_sources)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <ZoneForm
        action={saveZone.bind(null, id)}
        municipalityId={zone.municipality_id}
        initial={zone}
        documents={documents}
        otherZones={zones.filter((z) => z.id !== id)}
        submitLabel="Salvar zona"
      />
    </PageContainer>
  )
}

/** Shell estático + conteúdo dependente da URL em Suspense (navegação instantânea). */
export default function ZonePage(props: PageProps<"/admin/zonas/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ZonePageContent {...props} />
    </Suspense>
  )
}

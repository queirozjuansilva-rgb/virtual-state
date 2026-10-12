import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { CoverageBadge } from "@/components/admin/badges"
import { MunicipalityForm } from "@/components/admin/municipality-forms"
import { PageContainer, PageHeader, Section } from "@/components/admin/page-header"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createMunicipality } from "@/server/admin/actions"
import { listMunicipalities } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Municípios" }

/** Conta de relação aninhada do PostgREST: [{ count: n }]. */
const count = (rel: { count: number }[] | null | undefined) => rel?.[0]?.count ?? 0

async function MunicipalitiesPageContent() {
  const municipalities = await listMunicipalities()

  return (
    <PageContainer>
      <PageHeader
        title="Municípios e zoneamento"
        description="Base normativa genérica: cada município entra como dado, com leis, zonas e regras por uso."
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Município</TableHead>
              <TableHead>IBGE</TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead className="text-right">Leis</TableHead>
              <TableHead className="text-right">Zonas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {municipalities.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum município cadastrado.
                </TableCell>
              </TableRow>
            )}
            {municipalities.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/municipios/${m.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {m.name}/{m.uf}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{m.ibge_code}</TableCell>
                <TableCell>
                  <CoverageBadge status={m.coverage_status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {count(m.legal_documents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{count(m.zones)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Section title="Novo município">
        <MunicipalityForm action={createMunicipality} submitLabel="Cadastrar município" />
      </Section>
    </PageContainer>
  )
}

export default function MunicipalitiesPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <MunicipalitiesPageContent />
    </Suspense>
  )
}

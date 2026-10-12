import { ExternalLink, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { FictitiousBadge } from "@/components/admin/badges"
import {
  DeleteButton,
  LegalDocumentForm,
  MunicipalityForm,
} from "@/components/admin/municipality-forms"
import { PageContainer, PageHeader, Section } from "@/components/admin/page-header"
import { ZonesOverviewMap } from "@/components/admin/zones-overview-map"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LEGAL_DOCUMENT_KIND, ZONE_KIND } from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"
import {
  createLegalDocument,
  deleteLegalDocument,
  updateMunicipality,
} from "@/server/admin/actions"
import {
  getMunicipality,
  listEnvironmentalLayers,
  listLegalDocuments,
  listZones,
} from "@/server/admin/queries"

export const metadata: Metadata = { title: "Município" }

async function MunicipalityPageContent({ params }: PageProps<"/admin/municipios/[id]">) {
  const { id } = await params
  const [municipality, documents, zones, layers] = await Promise.all([
    getMunicipality(id),
    listLegalDocuments(id),
    listZones(id),
    listEnvironmentalLayers(id),
  ])

  return (
    <PageContainer>
      <PageHeader
        title={`${municipality.name}/${municipality.uf}`}
        description={`Código IBGE ${municipality.ibge_code}`}
      />

      <Section title="Dados do município">
        <MunicipalityForm
          action={updateMunicipality.bind(null, id)}
          initial={municipality}
          submitLabel="Salvar município"
        />
      </Section>

      <Section
        title="Zonas"
        description="Com geometria, a zona do lote é identificada por interseção. Sem geometria, só por atribuição manual."
        actions={
          <Button asChild size="sm">
            <Link href={`/admin/zonas/nova?municipio=${id}`}>
              <Plus aria-hidden /> Nova zona
            </Link>
          </Button>
        }
      >
        {zones.some((z) => z.geojson) && <ZonesOverviewMap zones={zones} layers={layers} />}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Geometria</TableHead>
                <TableHead className="text-right">Regras validadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma zona cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {zones.map((z) => {
                const validated = z.zoning_rules.filter((r) => r.status === "validado").length
                const drafts = z.zoning_rules.filter((r) => r.status === "rascunho").length
                return (
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/zonas/${z.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {z.code}
                      </Link>
                    </TableCell>
                    <TableCell>{z.name}</TableCell>
                    <TableCell>{ZONE_KIND[z.kind]}</TableCell>
                    <TableCell>{z.geojson ? "Sim" : "Não (só manual)"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {validated}
                      {drafts > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{drafts} rascunho{drafts > 1 ? "s" : ""})
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section
        title="Documentos legais"
        description="Leis e decretos citados como fonte das regras. Upload do PDF e extração assistida chegam na Fase 5."
      >
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Publicação</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nenhum documento cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {LEGAL_DOCUMENT_KIND[d.kind]} nº {d.number}
                      {d.is_fictitious && <FictitiousBadge />}
                      {d.official_url && (
                        <a
                          href={d.official_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary"
                          aria-label="Abrir link oficial"
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      )}
                    </div>
                    <span className="text-xs whitespace-normal text-muted-foreground">
                      {d.title}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDate(d.published_on)}</TableCell>
                  <TableCell className="tabular-nums">
                    {d.effective_from ? `desde ${formatDate(d.effective_from)}` : "—"}
                    {d.effective_until ? ` até ${formatDate(d.effective_until)}` : ""}
                  </TableCell>
                  <TableCell>
                    <DeleteButton
                      action={deleteLegalDocument.bind(null, d.id)}
                      confirmMessage={`Remover ${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}?`}
                      label={`Remover ${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <LegalDocumentForm action={createLegalDocument.bind(null, id)} />
      </Section>
    </PageContainer>
  )
}

/** Shell estático + conteúdo dependente da URL em Suspense (navegação instantânea). */
export default function MunicipalityPage(props: PageProps<"/admin/municipios/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <MunicipalityPageContent {...props} />
    </Suspense>
  )
}

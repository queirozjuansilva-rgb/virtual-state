import { ExternalLink, FileText } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { FictitiousBadge } from "@/components/admin/badges"
import { EnvioPdf } from "@/components/admin/lei/envio-pdf"
import { EtapasIngestao } from "@/components/admin/lei/etapas"
import { FormExtracao, ListaExecucoes } from "@/components/admin/lei/extracao"
import { LeitorPaginas } from "@/components/admin/lei/paginas"
import { Relacoes } from "@/components/admin/lei/relacoes"
import { PageContainer, PageHeader, Section } from "@/components/admin/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"
import { carregarLei } from "@/server/legislacao/queries"

export const metadata: Metadata = { title: "Lei" }

// OCR e extração rodam em Server Actions desta página: até 5 min por chamada.
export const maxDuration = 300

const STATUS: Record<string, string> = {
  sem_arquivo: "Sem arquivo",
  enviado: "PDF recebido",
  paginas: "Páginas lidas",
  fragmentado: "Trechos prontos",
  indexado: "Indexado",
  erro: "Erro",
}

async function LeiContent({ params }: PageProps<"/admin/leis/[id]">) {
  const { id } = await params
  const lei = await carregarLei(id)
  const { doc } = lei
  const titulo = `${LEGAL_DOCUMENT_KIND[doc.kind]} nº ${doc.number}`

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        description={doc.title}
        actions={
          <>
            {lei.pdfUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={lei.pdfUrl} target="_blank" rel="noreferrer">
                  <FileText aria-hidden /> Abrir PDF
                </a>
              </Button>
            )}
            {doc.official_url && (
              <Button asChild variant="ghost" size="sm">
                <a href={doc.official_url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Fonte oficial
                </a>
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {doc.municipality && (
            <Link
              href={`/admin/municipios/${doc.municipality.id}`}
              className="underline-offset-4 hover:underline"
            >
              {doc.municipality.name}/{doc.municipality.uf}
            </Link>
          )}
          <span>· publicada em {formatDate(doc.published_on)}</span>
          <span>
            · vigência{" "}
            {doc.effective_from ? `desde ${formatDate(doc.effective_from)}` : "não informada"}
            {doc.effective_until ? ` até ${formatDate(doc.effective_until)}` : ""}
          </span>
          <Badge variant={doc.ingestion_status === "erro" ? "destructive" : "outline"}>
            {STATUS[doc.ingestion_status]}
          </Badge>
          {doc.is_fictitious && <FictitiousBadge />}
        </div>
        {doc.ingestion_error && <p className="text-sm text-destructive">{doc.ingestion_error}</p>}
      </PageHeader>

      <Section
        title="Arquivo"
        description={
          doc.file_sha256
            ? `${doc.page_count} páginas · ${(Number(doc.file_size_bytes) / 1048576).toFixed(1)} MB · coletado em ${formatDate(doc.collected_at)} · ${doc.usage_rights ?? "direito de uso não informado"} · SHA-256 ${doc.file_sha256.slice(0, 12)}…`
            : "Envie o PDF oficial. A impressão digital (SHA-256) permite saber se o arquivo mudou."
        }
      >
        <EnvioPdf
          documentoId={doc.id}
          substituir={Boolean(doc.file_sha256)}
          urlOficial={doc.official_url}
          coleta={{ collected_at: doc.collected_at, usage_rights: doc.usage_rights }}
        />
      </Section>

      {doc.file_sha256 && (
        <Section
          title="Processamento"
          description="Cada etapa pode ser refeita. OCR e índice andam em lotes e retomam de onde pararam."
        >
          <EtapasIngestao
            documentoId={doc.id}
            totalPaginas={doc.page_count ?? 0}
            paginas={lei.paginas}
            trechos={lei.trechos}
            voyage={lei.voyage}
            custoOcrPendentes={lei.estimativas.ocrPendentes}
          />
        </Section>
      )}

      {lei.paginas.texto + lei.paginas.ocr > 0 && (
        <>
          <Section
            title="Extração assistida"
            description="A IA lê as páginas escolhidas e propõe, por zona, cada parâmetro com artigo, página e trecho. O trecho é conferido no texto da página; o que não bate vem marcado para conferir."
          >
            <FormExtracao
              documentoId={doc.id}
              totalPaginas={doc.page_count ?? 0}
              custoPorPagina={lei.estimativas.extracaoPorPagina}
            />
            <ListaExecucoes execucoes={lei.execucoes} />
          </Section>

          <Section
            title="Páginas"
            description="Procure no texto lido para achar onde estão os parâmetros."
          >
            <LeitorPaginas documentoId={doc.id} pdfUrl={lei.pdfUrl} />
          </Section>
        </>
      )}

      <Section
        title="Relações com outras normas"
        description="Registre as leis que alteram esta. Na homologação, regras com fonte alterada mostram um aviso para conferir o artigo."
      >
        <Relacoes
          documentoId={doc.id}
          alteradaPor={lei.relacoes.alteradaPor}
          altera={lei.relacoes.altera}
          outras={lei.outras}
        />
      </Section>
    </PageContainer>
  )
}

export default function LeiPage(props: PageProps<"/admin/leis/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <LeiContent {...props} />
    </Suspense>
  )
}

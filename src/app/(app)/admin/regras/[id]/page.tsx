import { CircleCheck, Sparkles, TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { RuleForm } from "@/components/admin/rule-form"
import { LAND_USE, LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { archiveZoningRule, saveZoningRule } from "@/server/admin/actions"
import { getRule, getRuleReview, listLegalDocuments } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Regra urbanística" }

const ACAO = { altera: "alterada", revoga: "revogada em parte" } as const

async function RulePageContent({ params, searchParams }: PageProps<"/admin/regras/[id]">) {
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const rule = await getRule(id)
  const zone = Array.isArray(rule.zone) ? rule.zone[0] : rule.zone
  const extraction = Array.isArray(rule.extraction) ? rule.extraction[0] : rule.extraction
  const [documents, review] = await Promise.all([
    zone ? listLegalDocuments(zone.municipality_id) : Promise.resolve([]),
    getRuleReview(rule),
  ])
  const sources = Object.fromEntries(rule.rule_sources.map((s) => [s.field, s]))
  const docLabels = Object.fromEntries(
    documents.map((d) => [d.id, `${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`]),
  )

  return (
    <PageContainer>
      <PageHeader
        title={`Regra: ${LAND_USE[rule.use_type]}`}
        description={
          zone ? (
            <Link href={`/admin/zonas/${zone.id}`} className="underline-offset-4 hover:underline">
              {zone.code}: {zone.name}
            </Link>
          ) : undefined
        }
      />
      {salvo && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
        >
          <CircleCheck className="size-4 text-primary" aria-hidden />
          {salvo === "validada"
            ? "Regra validada. Ela já alimenta o motor de viabilidade."
            : "Rascunho salvo. Rascunhos não alimentam o motor."}
        </p>
      )}
      {extraction && rule.status === "rascunho" && (
        <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Rascunho criado pela extração assistida de{" "}
            {new Date(extraction.created_at).toLocaleDateString("pt-BR")} (
            <Link
              href={`/admin/leis/${extraction.legal_document_id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {docLabels[extraction.legal_document_id] ?? "norma"}
            </Link>
            ). Confira cada valor contra o trecho e a página; o que a IA não achou ficou vazio.
          </span>
        </p>
      )}
      {review.alteracoes.length > 0 && (
        <details
          role="note"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <span>
              <span className="font-medium">
                Normas citadas têm {review.alteracoes.length} alteração(ões) posterior(es).
              </span>{" "}
              Confira se os artigos usados continuam valendo
              {review.alteracoes.some((a) => a.articles) &&
                ` (artigos indicados: ${review.alteracoes
                  .filter((a) => a.articles)
                  .map((a) => a.articles)
                  .join("; ")})`}
              . <span className="underline underline-offset-4">Ver a lista</span>
            </span>
          </summary>
          <ul className="mt-2 list-disc pl-10">
            {[...review.alteracoes]
              .sort((a, b) => Number(Boolean(b.articles)) - Number(Boolean(a.articles)))
              .map((a) => (
                <li key={a.id}>
                  {docLabels[a.to_document_id] ?? "Norma"} foi {ACAO[a.kind as keyof typeof ACAO]}{" "}
                  por{" "}
                  {a.por ? (
                    <Link
                      href={`/admin/leis/${a.por.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {LEGAL_DOCUMENT_KIND[a.por.kind]} nº {a.por.number}
                    </Link>
                  ) : (
                    "outra norma"
                  )}
                  {a.articles ? ` (${a.articles})` : ""}
                </li>
              ))}
          </ul>
        </details>
      )}
      <RuleForm
        key={rule.updated_at}
        action={saveZoningRule.bind(null, id, rule.zone_id)}
        archiveAction={archiveZoningRule.bind(null, id)}
        initial={{
          use_type: rule.use_type,
          use_label_local: rule.use_label_local,
          observacoes: rule.observacoes,
          validation_note: rule.validation_note,
          status: rule.status,
          validated_at: rule.validated_at,
          values: rule,
          sources,
        }}
        documents={documents}
        review={{
          extracted: (rule.extracted_values as Record<string, unknown> | null) ?? null,
          validada: review.validada
            ? {
                values: review.validada as unknown as Record<string, unknown>,
                sources: Object.fromEntries(review.validada.rule_sources.map((s) => [s.field, s])),
              }
            : null,
          pdfUrls: review.pdfUrls,
          docLabels,
        }}
      />
    </PageContainer>
  )
}

/** Shell estático + conteúdo dependente da URL em Suspense (navegação instantânea). */
export default function RulePage(props: PageProps<"/admin/regras/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <RulePageContent {...props} />
    </Suspense>
  )
}

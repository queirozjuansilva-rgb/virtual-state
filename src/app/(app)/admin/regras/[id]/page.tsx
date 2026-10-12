import { CircleCheck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { RuleForm } from "@/components/admin/rule-form"
import { LAND_USE } from "@/lib/domain/labels"
import { archiveZoningRule, saveZoningRule } from "@/server/admin/actions"
import { getRule, listLegalDocuments } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Regra urbanística" }

async function RulePageContent({ params, searchParams }: PageProps<"/admin/regras/[id]">) {
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const rule = await getRule(id)
  const zone = Array.isArray(rule.zone) ? rule.zone[0] : rule.zone
  const documents = zone ? await listLegalDocuments(zone.municipality_id) : []
  const sources = Object.fromEntries(rule.rule_sources.map((s) => [s.field, s]))

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
      <RuleForm
        key={rule.updated_at}
        action={saveZoningRule.bind(null, id, rule.zone_id)}
        archiveAction={archiveZoningRule.bind(null, id)}
        initial={{
          use_type: rule.use_type,
          use_label_local: rule.use_label_local,
          observacoes: rule.observacoes,
          status: rule.status,
          validated_at: rule.validated_at,
          values: rule,
          sources,
        }}
        documents={documents}
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

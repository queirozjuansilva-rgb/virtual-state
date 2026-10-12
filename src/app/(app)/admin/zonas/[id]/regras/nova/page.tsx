import type { Metadata } from "next"

import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { RuleForm } from "@/components/admin/rule-form"
import { saveZoningRule } from "@/server/admin/actions"
import { getZone, listLegalDocuments } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Nova regra" }

export default async function NewRulePage({ params }: PageProps<"/admin/zonas/[id]/regras/nova">) {
  const { id } = await params
  const zone = await getZone(id)
  const documents = await listLegalDocuments(zone.municipality_id)

  return (
    <PageContainer>
      <PageHeader
        title="Nova regra urbanística"
        description={`${zone.code}: ${zone.name}. Só regras validadas alimentam o motor.`}
      />
      <RuleForm
        action={saveZoningRule.bind(null, null, id)}
        initial={{ values: {}, sources: {} }}
        documents={documents}
      />
    </PageContainer>
  )
}

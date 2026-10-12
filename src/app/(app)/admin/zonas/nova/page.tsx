import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { ZoneForm } from "@/components/admin/zone-form"
import { saveZone } from "@/server/admin/actions"
import { getMunicipality, listLegalDocuments, listZones } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Nova zona" }

export default async function NewZonePage({ searchParams }: PageProps<"/admin/zonas/nova">) {
  const { municipio } = await searchParams
  const parsed = z.uuid().safeParse(municipio)
  if (!parsed.success) notFound()

  const [municipality, documents, zones] = await Promise.all([
    getMunicipality(parsed.data),
    listLegalDocuments(parsed.data),
    listZones(parsed.data),
  ])

  return (
    <PageContainer>
      <PageHeader title="Nova zona" description={`${municipality.name}/${municipality.uf}`} />
      <ZoneForm
        action={saveZone.bind(null, null)}
        municipalityId={municipality.id}
        initial={{}}
        documents={documents}
        otherZones={zones}
        submitLabel="Cadastrar zona"
      />
    </PageContainer>
  )
}

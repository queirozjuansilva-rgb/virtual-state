import type { Metadata } from "next"
import { Suspense } from "react"

import AdminLoading from "@/app/(app)/admin/loading"
import { LandForm } from "@/components/admin/land-form"
import { PageContainer, PageHeader } from "@/components/admin/page-header"
import { saveLand } from "@/server/admin/actions"
import { listGeoReference, listMunicipalityOptions } from "@/server/admin/queries"

export const metadata: Metadata = { title: "Novo terreno" }

async function NewLandPageContent() {
  const [municipalities, { zones, layers }] = await Promise.all([
    listMunicipalityOptions(),
    listGeoReference(),
  ])

  return (
    <PageContainer>
      <PageHeader
        title="Novo terreno"
        description="Cadastre o lote com o polígono: área e zona são calculadas automaticamente."
      />
      <LandForm
        action={saveLand.bind(null, null)}
        initial={{ status: "disponivel", zone_assignment: "automatica" }}
        municipalities={municipalities}
        zones={zones}
        layers={layers}
        submitLabel="Cadastrar terreno"
      />
    </PageContainer>
  )
}

export default function NewLandPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <NewLandPageContent />
    </Suspense>
  )
}

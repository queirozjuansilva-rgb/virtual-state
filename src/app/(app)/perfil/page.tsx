import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer, PageHeader, Section } from "@/components/admin/page-header"
import { PerfilForm } from "@/components/perfil/perfil-form"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/lib/auth/dal"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Perfil do investidor" }

export default function PerfilPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Perfil do investidor"
        description="O copiloto usa estas preferências para filtrar terrenos e comparar os estudos com a margem e o risco que você aceita."
      />
      <Section title="Preferências">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Perfil />
        </Suspense>
      </Section>
    </PageContainer>
  )
}

async function Perfil() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from("investor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()
  return <PerfilForm perfil={data} />
}

import { PageContainer } from "@/components/admin/page-header"
import { Skeleton } from "@/components/ui/skeleton"

/** Placeholder enquanto cada página do admin busca dados (navegação instantânea). */
export default function AdminLoading() {
  return (
    <PageContainer>
      <div className="space-y-2" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </PageContainer>
  )
}

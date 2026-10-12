import { Suspense } from "react"

import { PageContainer } from "@/components/admin/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requireAdmin } from "@/lib/auth/dal"

/** Área administrativa: só admin (os demais recebem 404). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return children
}

function AdminSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-72 w-full" />
    </PageContainer>
  )
}

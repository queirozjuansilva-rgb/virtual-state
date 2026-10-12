import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { ChatWorkspace } from "@/components/chat/chat-workspace"
import { Skeleton } from "@/components/ui/skeleton"
import { itensDaConversa } from "@/lib/ai/conteudo"
import { requireUser } from "@/lib/auth/dal"
import { ENGINE_VERSION } from "@/lib/feasibility/version"
import { createClient } from "@/lib/supabase/server"
import { carregarMensagens, obterConversa } from "@/server/copiloto/conversas"

export const metadata: Metadata = { title: "Análise" }

export default function ConversaPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <Suspense fallback={<ConversaCarregando />}>
        <Conversa params={params} />
      </Suspense>
    </div>
  )
}

async function Conversa({ params }: { params: PageProps<"/chat/[id]">["params"] }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  await requireUser()
  const supabase = await createClient()
  const conversa = await obterConversa(supabase, id)
  if (!conversa) notFound()
  const mensagens = await carregarMensagens(supabase, id)
  return (
    <ChatWorkspace
      key={id}
      conversaId={id}
      itensIniciais={itensDaConversa(mensagens)}
      terrenoInicial={conversa.land_id}
      versaoMotor={ENGINE_VERSION}
    />
  )
}

function ConversaCarregando() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6" aria-busy="true">
      <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}

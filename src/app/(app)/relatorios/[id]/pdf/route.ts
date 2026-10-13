import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { gerarPdfRelatorio, nomeArquivoPdf, respostaPdf } from "@/server/relatorios/pdf/gerar"
import { carregarRelatorio } from "@/server/relatorios/queries"

/** PDF de uma versão do relatório (a atual, ou ?versao=N). RLS: organização e admin. */
export async function GET(request: Request, { params }: RouteContext<"/relatorios/[id]/pdf">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return new Response("Relatório inválido.", { status: 404 })
  const versao = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(new URL(request.url).searchParams.get("versao") ?? undefined)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) return new Response("Sessão expirada.", { status: 401 })

  const relatorio = await carregarRelatorio(supabase, id, versao.success ? versao.data : undefined)
  if (!relatorio) return new Response("Relatório não encontrado.", { status: 404 })

  const pdf = await gerarPdfRelatorio(relatorio)
  return respostaPdf(pdf, nomeArquivoPdf(relatorio.titulo, relatorio.versao.versao))
}

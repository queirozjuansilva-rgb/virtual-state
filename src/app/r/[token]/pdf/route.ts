import { createClient } from "@/lib/supabase/server"
import { carregarCompartilhado } from "@/server/relatorios/compartilhado"
import { gerarPdfRelatorio, nomeArquivoPdf, respostaPdf } from "@/server/relatorios/pdf/gerar"

/** PDF do link compartilhado (última versão salva, sem login). */
export async function GET(_request: Request, { params }: RouteContext<"/r/[token]/pdf">) {
  const { token } = await params
  const relatorio = await carregarCompartilhado(await createClient(), token)
  if (!relatorio) return new Response("Link inválido ou desativado.", { status: 404 })
  const pdf = await gerarPdfRelatorio(relatorio)
  return respostaPdf(pdf, nomeArquivoPdf(relatorio.titulo, relatorio.versao.versao))
}

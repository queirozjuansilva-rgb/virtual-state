import "server-only"

import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"

import { montarModeloPdf } from "@/lib/relatorio/pdf-modelo"

import { RelatorioPdf } from "./relatorio-pdf"

type DadosPdf = Omit<Parameters<typeof montarModeloPdf>[0], "geradoEm">

/** Nome do arquivo: título sem acentos, em minúsculas, com a versão. */
export function nomeArquivoPdf(titulo: string, versao: number): string {
  const slug = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "relatorio"}-v${versao}.pdf`
}

export async function gerarPdfRelatorio(dados: DadosPdf): Promise<Buffer> {
  const modelo = montarModeloPdf({ ...dados, geradoEm: new Date() })
  // RelatorioPdf devolve um <Document>; o tipo de renderToBuffer pede o elemento dele.
  const documento = createElement(RelatorioPdf, { modelo }) as unknown as Parameters<
    typeof renderToBuffer
  >[0]
  return renderToBuffer(documento)
}

export function respostaPdf(pdf: Buffer, nome: string): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

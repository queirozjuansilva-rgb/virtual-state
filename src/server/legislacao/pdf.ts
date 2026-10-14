import "server-only"

import { createHash } from "node:crypto"

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  type PDFPage,
} from "pdf-lib"
import { extractText, getDocumentProxy } from "unpdf"

/** Limite do bucket legal-documents (50 MB) e teto de páginas por documento. */
export const MAX_BYTES_PDF = 50 * 1024 * 1024
export const MAX_PAGINAS_PDF = 1500

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Texto de cada página (camada de texto do PDF). Página escaneada volta vazia. */
export async function lerTextoPaginas(bytes: Uint8Array): Promise<string[]> {
  // unpdf/pdf.js pode transferir o buffer: passa uma cópia.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  return text
}

export async function contarPaginas(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getPageCount()
}

function bytesDoConteudo(doc: PDFDocument, page: PDFPage): string {
  const contents = page.node.Contents()
  const streams =
    contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents]
  let ops = ""
  for (const s of streams) {
    if (s instanceof PDFRawStream)
      ops += new TextDecoder("latin1").decode(decodePDFRawStream(s).decode())
  }
  return ops
}

/**
 * Deixa nos recursos da página só as imagens/formulários que ela desenha.
 * PDFs escaneados costumam compartilhar um único dicionário com todas as
 * imagens do documento; sem isso, recortar 5 páginas copiava as 437 imagens
 * (23 MB em vez de ~500 KB na LC 62/2009).
 */
function podarRecursos(doc: PDFDocument, page: PDFPage) {
  const res = page.node.Resources()
  const xobjects = res?.lookup(PDFName.of("XObject"), PDFDict)
  if (!res || !xobjects) return
  let usados: Set<string>
  try {
    usados = new Set(
      [...bytesDoConteudo(doc, page).matchAll(/\/([^\s/<>[\]()]+)\s+Do\b/g)].map((m) => m[1]),
    )
  } catch {
    return // Conteúdo que não sabemos decodificar: copia tudo (mais pesado, mas correto).
  }
  const novoX = doc.context.obj({})
  for (const nome of xobjects.keys()) {
    if (usados.has(nome.asString().slice(1))) novoX.set(nome, xobjects.get(nome) as PDFRef)
  }
  const novoRes = res.clone(doc.context)
  novoRes.set(PDFName.of("XObject"), novoX)
  page.node.set(PDFName.of("Resources"), novoRes)
}

/** Novo PDF só com as páginas pedidas (1-based), para mandar ao modelo. */
export async function recortarPaginas(
  bytes: Uint8Array,
  paginas: readonly number[],
): Promise<Uint8Array> {
  const origem = await PDFDocument.load(bytes, { updateMetadata: false })
  const indices = paginas.map((p) => p - 1).filter((i) => i >= 0 && i < origem.getPageCount())
  for (const i of indices) podarRecursos(origem, origem.getPage(i))
  const destino = await PDFDocument.create()
  const copiadas = await destino.copyPages(origem, indices)
  copiadas.forEach((p) => destino.addPage(p))
  return destino.save()
}

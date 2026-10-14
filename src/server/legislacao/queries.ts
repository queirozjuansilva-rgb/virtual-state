import "server-only"

import { notFound } from "next/navigation"

import { requireAdmin } from "@/lib/auth/dal"
import { acertoDaExtracao } from "@/lib/legislacao/extracao"
import { createClient } from "@/lib/supabase/server"

import {
  configIngestao,
  estimarCustoOcr,
  parametrosEstimativaExtracao,
  temChaveVoyage,
} from "./config"

const BUCKET = "legal-documents"

/** Tudo o que a página da lei mostra: arquivo, andamento, relações e extrações. */
export async function carregarLei(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data: doc, error } = await supabase
    .from("legal_documents")
    .select("*, municipality:municipalities(id, name, uf)")
    .eq("id", id)
    .maybeSingle()
  if (error || !doc) notFound()

  const contar = (method: "texto" | "ocr" | "pendente") =>
    supabase
      .from("legal_document_pages")
      .select("page_number", { count: "exact", head: true })
      .eq("legal_document_id", id)
      .eq("method", method)

  const [texto, ocr, pendente, trechos, indexados, alteradaPor, altera, outras, execucoes, pdf] =
    await Promise.all([
      contar("texto"),
      contar("ocr"),
      contar("pendente"),
      supabase
        .from("legal_chunks")
        .select("id", { count: "exact", head: true })
        .eq("legal_document_id", id),
      supabase
        .from("legal_chunks")
        .select("id", { count: "exact", head: true })
        .eq("legal_document_id", id)
        .eq("embedding_model", configIngestao.VOYAGE_MODEL),
      supabase
        .from("legal_document_links")
        .select(
          "id, kind, articles, notes, outra:legal_documents!legal_document_links_from_document_id_fkey(id, kind, number)",
        )
        .eq("to_document_id", id),
      supabase
        .from("legal_document_links")
        .select(
          "id, kind, articles, notes, outra:legal_documents!legal_document_links_to_document_id_fkey(id, kind, number)",
        )
        .eq("from_document_id", id),
      supabase
        .from("legal_documents")
        .select("id, kind, number, published_on")
        .eq("municipality_id", doc.municipality_id)
        .neq("id", id)
        .order("published_on", { ascending: true, nullsFirst: false }),
      supabase
        .from("extraction_runs")
        .select(
          "id, pages, target_use, status, model, prompt_version, cost_usd, error, created_at, output, regras:zoning_rules(id, status, extracted_values, ca_min, ca_basico, ca_max, to_max, permeabilidade_min, gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos, lote_minimo_m2, testada_minima_m, outorga_fator, outorga_formula, permitted, zone:zones(code))",
        )
        .eq("legal_document_id", id)
        .order("created_at", { ascending: false }),
      doc.storage_path
        ? supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60 * 60)
        : Promise.resolve({ data: null }),
    ])

  return {
    doc: {
      ...doc,
      municipality: Array.isArray(doc.municipality) ? doc.municipality[0] : doc.municipality,
    },
    pdfUrl: pdf.data?.signedUrl ?? null,
    paginas: { texto: texto.count ?? 0, ocr: ocr.count ?? 0, pendente: pendente.count ?? 0 },
    trechos: { total: trechos.count ?? 0, indexados: indexados.count ?? 0 },
    voyage: temChaveVoyage(),
    estimativas: {
      ocrPendentes: estimarCustoOcr(pendente.count ?? 0),
      extracao: parametrosEstimativaExtracao(),
    },
    relacoes: {
      alteradaPor: (alteradaPor.data ?? []).map((r) => ({
        ...r,
        outra: Array.isArray(r.outra) ? r.outra[0] : r.outra,
      })),
      altera: (altera.data ?? []).map((r) => ({
        ...r,
        outra: Array.isArray(r.outra) ? r.outra[0] : r.outra,
      })),
    },
    outras: outras.data ?? [],
    execucoes: (execucoes.data ?? []).map(({ output, regras, ...r }) => {
      const saida = output as { zonas?: { codigo: string }[] } | null
      const homologadas = regras.filter((g) => g.status !== "rascunho" && g.extracted_values)
      const acerto = homologadas.reduce(
        (soma, g) => {
          const a = acertoDaExtracao(
            g.extracted_values as Record<string, unknown>,
            g as Record<string, unknown>,
          )
          return { campos: soma.campos + a.campos, iguais: soma.iguais + a.iguais }
        },
        { campos: 0, iguais: 0 },
      )
      return {
        ...r,
        zonasEncontradas: saida?.zonas?.map((z) => z.codigo) ?? [],
        regras: regras.map((g) => ({
          id: g.id,
          status: g.status,
          zona: (Array.isArray(g.zone) ? g.zone[0] : g.zone)?.code ?? "?",
        })),
        acerto,
      }
    }),
  }
}

export type LeiCarregada = Awaited<ReturnType<typeof carregarLei>>

/** Busca simples no texto das páginas, para achar onde estão os parâmetros. */
export async function procurarNasPaginas(id: string, termo: string) {
  await requireAdmin()
  const supabase = await createClient()
  const limpo = termo
    .replace(/[%_\\]/g, " ")
    .trim()
    .slice(0, 100)
  if (limpo.length < 3) return []
  const { data } = await supabase
    .from("legal_document_pages")
    .select("page_number, content, method")
    .eq("legal_document_id", id)
    .ilike("content", `%${limpo}%`)
    .order("page_number")
    .limit(30)
  return (data ?? []).map((p) => {
    const i = p.content.toLowerCase().indexOf(limpo.toLowerCase())
    const inicio = Math.max(0, i - 80)
    return {
      pagina: p.page_number,
      metodo: p.method,
      trecho: `${inicio > 0 ? "…" : ""}${p.content.slice(inicio, i + limpo.length + 120).replace(/\s+/g, " ")}…`,
    }
  })
}

export async function lerPagina(id: string, pagina: number) {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from("legal_document_pages")
    .select("page_number, content, method, ocr_model, updated_at")
    .eq("legal_document_id", id)
    .eq("page_number", pagina)
    .maybeSingle()
  return data
}

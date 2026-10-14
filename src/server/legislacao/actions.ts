"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { requireAdmin } from "@/lib/auth/dal"
import { LAND_USE, LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { montarRascunhos, saidaExtracaoSchema } from "@/lib/legislacao/extracao"
import { fragmentar, textoParaEmbedding } from "@/lib/legislacao/fragmentar"
import { precisaDeOcr } from "@/lib/legislacao/ocr"
import { interpretarPaginas } from "@/lib/legislacao/paginas"
import type { Enums, Json } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"

import { configIngestao, temChaveVoyage } from "./config"
import { baixarPdfOficial } from "./download"
import { gerarEmbeddings, TRECHOS_POR_CHAMADA, vetorParaPg } from "./embeddings"
import { extrairParametros, PAGINAS_POR_CHAMADA_OCR, transcreverPaginas } from "./modelo"
import { contarPaginas, lerTextoPaginas, MAX_BYTES_PDF, MAX_PAGINAS_PDF, sha256 } from "./pdf"
import { mensagemExtracao, VERSAO_PROMPT_EXTRACAO } from "./prompts"
import { lerPagina, procurarNasPaginas } from "./queries"

/**
 * Ingestão normativa (ADR 0011), em etapas curtas e retomáveis: cada ação faz
 * um lote e devolve quanto falta; a tela chama de novo até terminar. Assim
 * cabe no limite de tempo das funções da Vercel sem fila externa. Só admin.
 */

const BUCKET = "legal-documents"
/** Chamadas de OCR em paralelo por rodada (3 × 4 páginas ≈ 20 s). */
const OCR_PARALELO = 3

export type ResultadoEtapa =
  { ok: true; mensagem: string; restantes?: number } | { ok: false; erro: string }

async function admin() {
  await requireAdmin()
  return createClient()
}

type Cliente = Awaited<ReturnType<typeof admin>>

async function documento(supabase: Cliente, id: string) {
  const { data, error } = await supabase
    .from("legal_documents")
    .select(
      "id, municipality_id, kind, number, title, storage_path, page_count, municipality:municipalities(name, uf)",
    )
    .eq("id", id)
    .single()
  if (error) throw new Error("Documento não encontrado.")
  return data
}

async function baixarPdf(supabase: Cliente, caminho: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho)
  if (error || !data) throw new Error("Não foi possível ler o PDF no armazenamento.")
  return new Uint8Array(await data.arrayBuffer())
}

async function marcarErro(supabase: Cliente, id: string, erro: string) {
  await supabase
    .from("legal_documents")
    .update({
      ingestion_status: "erro",
      ingestion_error: erro.slice(0, 1000),
      ingestion_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." }
}

// 1. Envio ---------------------------------------------------------------------------

/** URL assinada para o navegador enviar o PDF direto ao Storage (sem passar pelo servidor). */
export async function criarUrlDeEnvio(
  documentoId: string,
): Promise<{ ok: true; caminho: string; token: string } | { ok: false; erro: string }> {
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    const caminho = `${doc.municipality_id}/${doc.id}.pdf`
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(caminho, { upsert: true })
    if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio." }
    return { ok: true, caminho, token: data.token }
  } catch (e) {
    return falha(e)
  }
}

const coletaSchema = z.object({
  collected_at: z.iso.date().nullable(),
  usage_rights: z.string().trim().max(300).nullable(),
})

async function gravarArquivo(
  supabase: Cliente,
  doc: { id: string },
  caminho: string,
  bytes: Uint8Array,
  coleta: z.output<typeof coletaSchema>,
  officialUrl?: string,
): Promise<ResultadoEtapa> {
  if (bytes.length > MAX_BYTES_PDF) return { ok: false, erro: "O PDF passa de 50 MB." }
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    return { ok: false, erro: "O arquivo não é um PDF." }
  const paginas = await contarPaginas(bytes)
  if (paginas > MAX_PAGINAS_PDF)
    return { ok: false, erro: `O PDF tem mais de ${MAX_PAGINAS_PDF} páginas.` }

  await supabase.from("legal_document_pages").delete().eq("legal_document_id", doc.id)
  await supabase.from("legal_chunks").delete().eq("legal_document_id", doc.id)
  const { error } = await supabase
    .from("legal_documents")
    .update({
      storage_path: caminho,
      file_sha256: sha256(bytes),
      file_size_bytes: bytes.length,
      page_count: paginas,
      collected_at: coleta.collected_at,
      usage_rights: coleta.usage_rights || null,
      ...(officialUrl ? { official_url: officialUrl } : {}),
      ingestion_status: "enviado",
      ingestion_error: null,
      ingestion_updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id)
  if (error) return { ok: false, erro: "Não foi possível registrar o arquivo." }
  refresh()
  return { ok: true, mensagem: `PDF recebido: ${paginas} páginas.` }
}

/** Confere o arquivo enviado (PDF, tamanho, páginas), guarda a impressão digital e zera o processamento anterior. */
export async function registrarArquivo(
  documentoId: string,
  caminho: string,
  coleta: z.input<typeof coletaSchema>,
): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    if (caminho !== `${doc.municipality_id}/${doc.id}.pdf`)
      return { ok: false, erro: "Caminho do arquivo inválido." }
    return await gravarArquivo(
      supabase,
      doc,
      caminho,
      await baixarPdf(supabase, caminho),
      coletaSchema.parse(coleta),
    )
  } catch (e) {
    return falha(e)
  }
}

/**
 * Baixa o PDF direto da fonte oficial (SAPL, Diário Oficial) e o guarda no
 * Storage. A URL vira o link oficial do documento (origem rastreável).
 */
export async function importarDaFonteOficial(
  documentoId: string,
  endereco: string,
  coleta: z.input<typeof coletaSchema>,
): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    const url = z
      .url({ protocol: /^https$/ })
      .max(2000)
      .parse(endereco.trim())
    const bytes = await baixarPdfOficial(url)
    const caminho = `${doc.municipality_id}/${doc.id}.pdf`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true })
    if (error) return { ok: false, erro: "Não foi possível guardar o PDF." }
    return await gravarArquivo(supabase, doc, caminho, bytes, coletaSchema.parse(coleta), url)
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, erro: "Informe um endereço https:// válido." }
    return falha(e)
  }
}

// 2. Texto das páginas ----------------------------------------------------------------

export async function extrairTextoDasPaginas(documentoId: string): Promise<ResultadoEtapa> {
  const supabase = await admin()
  try {
    const doc = await documento(supabase, documentoId)
    if (!doc.storage_path) return { ok: false, erro: "Envie o PDF primeiro." }
    const textos = await lerTextoPaginas(await baixarPdf(supabase, doc.storage_path))
    const linhas = textos.map((texto, i) => {
      const ocr = precisaDeOcr(texto)
      return {
        legal_document_id: doc.id,
        page_number: i + 1,
        method: (ocr ? "pendente" : "texto") as Enums<"page_text_method">,
        content: ocr ? "" : texto,
        ocr_model: null,
        updated_at: new Date().toISOString(),
      }
    })
    for (let i = 0; i < linhas.length; i += 100) {
      const { error } = await supabase.from("legal_document_pages").upsert(linhas.slice(i, i + 100))
      if (error) throw new Error("Não foi possível gravar as páginas.")
    }
    await supabase
      .from("legal_documents")
      .update({
        ingestion_status: "paginas",
        ingestion_error: null,
        ingestion_updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id)
    const pendentes = linhas.filter((l) => l.method === "pendente").length
    refresh()
    return {
      ok: true,
      mensagem: `${linhas.length - pendentes} páginas com texto; ${pendentes} escaneadas aguardam OCR.`,
      restantes: pendentes,
    }
  } catch (e) {
    await marcarErro(supabase, documentoId, e instanceof Error ? e.message : "Erro ao ler o texto.")
    return falha(e)
  }
}

// 3. OCR ------------------------------------------------------------------------------

/**
 * Transcreve o próximo lote de páginas pendentes (ou só as do intervalo pedido).
 * Página que o modelo não devolveu continua pendente para a próxima rodada.
 */
export async function transcreverProximasPaginas(
  documentoId: string,
  intervalo?: string,
): Promise<ResultadoEtapa> {
  const supabase = await admin()
  try {
    const doc = await documento(supabase, documentoId)
    if (!doc.storage_path) return { ok: false, erro: "Envie o PDF primeiro." }
    let consulta = supabase
      .from("legal_document_pages")
      .select("page_number")
      .eq("legal_document_id", doc.id)
      .eq("method", "pendente")
      .order("page_number")
    if (intervalo) {
      const paginas = interpretarPaginas(intervalo, doc.page_count ?? 0)
      if (!paginas.ok) return { ok: false, erro: paginas.erro }
      consulta = consulta.in("page_number", paginas.paginas)
    }
    const { data: pendentes, error } = await consulta.limit(PAGINAS_POR_CHAMADA_OCR * OCR_PARALELO)
    if (error) throw new Error("Não foi possível listar as páginas pendentes.")
    if (pendentes.length === 0)
      return { ok: true, mensagem: "Nenhuma página pendente de OCR.", restantes: 0 }

    const pdf = await baixarPdf(supabase, doc.storage_path)
    const lotes: number[][] = []
    for (let i = 0; i < pendentes.length; i += PAGINAS_POR_CHAMADA_OCR) {
      lotes.push(pendentes.slice(i, i + PAGINAS_POR_CHAMADA_OCR).map((p) => p.page_number))
    }
    const resultados = await Promise.all(lotes.map((l) => transcreverPaginas(pdf, l)))

    let feitas = 0
    let custo = 0
    for (const r of resultados) {
      custo += r.uso.custoUsd ?? 0
      const linhas = [...r.paginas].map(([pagina, texto]) => ({
        legal_document_id: doc.id,
        page_number: pagina,
        method: "ocr" as const,
        content: texto,
        ocr_model: r.modelo,
        updated_at: new Date().toISOString(),
      }))
      if (linhas.length > 0) {
        const { error: e } = await supabase.from("legal_document_pages").upsert(linhas)
        if (e) throw new Error("Não foi possível gravar o OCR.")
        feitas += linhas.length
      }
    }

    const { count } = await supabase
      .from("legal_document_pages")
      .select("page_number", { count: "exact", head: true })
      .eq("legal_document_id", doc.id)
      .eq("method", "pendente")
    refresh()
    return {
      ok: true,
      mensagem: `${feitas} páginas transcritas (US$ ${custo.toFixed(2)}).`,
      restantes: intervalo ? 0 : (count ?? 0),
    }
  } catch (e) {
    return falha(e)
  }
}

/** Volta páginas para "pendente" (refazer OCR de um trecho mal lido ou de tabela achatada). */
export async function marcarParaOcr(
  documentoId: string,
  intervalo: string,
): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    const paginas = interpretarPaginas(intervalo, doc.page_count ?? 0)
    if (!paginas.ok) return { ok: false, erro: paginas.erro }
    const { error } = await supabase
      .from("legal_document_pages")
      .update({
        method: "pendente",
        content: "",
        ocr_model: null,
        updated_at: new Date().toISOString(),
      })
      .eq("legal_document_id", doc.id)
      .in("page_number", paginas.paginas)
    if (error) throw new Error("Não foi possível marcar as páginas.")
    refresh()
    return { ok: true, mensagem: `${paginas.paginas.length} páginas marcadas para OCR.` }
  } catch (e) {
    return falha(e)
  }
}

// 4. Trechos para a busca ----------------------------------------------------------------

export async function dividirEmTrechos(documentoId: string): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    const paginas: { page_number: number; content: string }[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase
        .from("legal_document_pages")
        .select("page_number, content, method")
        .eq("legal_document_id", doc.id)
        .neq("method", "pendente")
        .order("page_number")
        .range(de, de + 999)
      if (error) throw new Error("Não foi possível ler as páginas.")
      paginas.push(...data)
      if (data.length < 1000) break
    }
    if (paginas.length === 0)
      return { ok: false, erro: "Nenhuma página com texto. Rode a leitura e o OCR antes." }
    const trechos = fragmentar(paginas.map((p) => ({ numero: p.page_number, texto: p.content })))
    const { data: total, error } = await supabase.rpc("admin_substituir_trechos", {
      p_document_id: doc.id,
      p_trechos: trechos as unknown as Json,
    })
    if (error) throw new Error("Não foi possível gravar os trechos.")
    refresh()
    return { ok: true, mensagem: `${total} trechos criados a partir de ${paginas.length} páginas.` }
  } catch (e) {
    return falha(e)
  }
}

// 5. Índice semântico ----------------------------------------------------------------------

export async function indexarProximosTrechos(documentoId: string): Promise<ResultadoEtapa> {
  if (!temChaveVoyage()) {
    return {
      ok: false,
      erro: "Configure VOYAGE_API_KEY para a busca por sentido. Sem ela, a busca usa só palavras.",
    }
  }
  try {
    const supabase = await admin()
    const doc = await documento(supabase, documentoId)
    const modelo = configIngestao.VOYAGE_MODEL
    const { data: trechos, error } = await supabase
      .from("legal_chunks")
      .select("id, article, section, content")
      .eq("legal_document_id", doc.id)
      .or(`embedding_model.is.null,embedding_model.neq.${modelo}`)
      .order("chunk_index")
      .limit(TRECHOS_POR_CHAMADA)
    if (error) throw new Error("Não foi possível ler os trechos.")
    if (trechos.length > 0) {
      const { vetores } = await gerarEmbeddings(
        trechos.map((t) =>
          textoParaEmbedding({ secao: t.section, artigo: t.article, conteudo: t.content }),
        ),
        "document",
      )
      const itens = trechos.map((t, i) => ({ id: t.id, embedding: vetorParaPg(vetores[i]) }))
      const { error: e } = await supabase.rpc("admin_gravar_embeddings", {
        p_itens: itens,
        p_modelo: modelo,
      })
      if (e) throw new Error("Não foi possível gravar o índice.")
    }
    const { count } = await supabase
      .from("legal_chunks")
      .select("id", { count: "exact", head: true })
      .eq("legal_document_id", doc.id)
      .or(`embedding_model.is.null,embedding_model.neq.${modelo}`)
    if ((count ?? 0) === 0) {
      await supabase
        .from("legal_documents")
        .update({
          ingestion_status: "indexado",
          ingestion_error: null,
          ingestion_updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id)
    }
    refresh()
    return { ok: true, mensagem: `${trechos.length} trechos indexados.`, restantes: count ?? 0 }
  } catch (e) {
    return falha(e)
  }
}

// 6. Extração assistida ----------------------------------------------------------------------

const extracaoSchema = z.object({
  paginas: z.string().trim().min(1, "Informe as páginas."),
  usoAlvo: z.enum(Object.keys(LAND_USE) as [Enums<"land_use">, ...Enums<"land_use">[]]),
  instrucoes: z.string().trim().max(2000).nullable(),
})

/** Teto de páginas por extração: mantém a resposta dentro do limite e o custo previsível. */
const MAX_PAGINAS_EXTRACAO = 40

export async function extrairDaLei(
  documentoId: string,
  entrada: z.input<typeof extracaoSchema>,
): Promise<ResultadoEtapa & { execucaoId?: string }> {
  const supabase = await admin()
  let execucaoId: string | undefined
  try {
    const dados = extracaoSchema.parse(entrada)
    const doc = await documento(supabase, documentoId)
    const intervalo = interpretarPaginas(dados.paginas, doc.page_count ?? 0)
    if (!intervalo.ok) return { ok: false, erro: intervalo.erro }
    if (intervalo.paginas.length > MAX_PAGINAS_EXTRACAO) {
      return { ok: false, erro: `Extraia até ${MAX_PAGINAS_EXTRACAO} páginas por vez.` }
    }

    const [{ data: paginas }, { data: zonas }] = await Promise.all([
      supabase
        .from("legal_document_pages")
        .select("page_number, content, method")
        .eq("legal_document_id", doc.id)
        .in("page_number", intervalo.paginas)
        .order("page_number"),
      supabase
        .from("zones")
        .select("code")
        .eq("municipality_id", doc.municipality_id)
        .order("code"),
    ])
    const comTexto = (paginas ?? []).filter((p) => p.method !== "pendente" && p.content.trim())
    if (comTexto.length === 0)
      return { ok: false, erro: "As páginas escolhidas ainda não têm texto (rode o OCR)." }
    const semTexto = intervalo.paginas.length - comTexto.length

    const { data: run, error } = await supabase
      .from("extraction_runs")
      .insert({
        legal_document_id: doc.id,
        pages: intervalo.paginas,
        target_use: dados.usoAlvo,
        instructions: dados.instrucoes || null,
        model: configIngestao.INGESTAO_EXTRACAO_MODEL,
        prompt_version: VERSAO_PROMPT_EXTRACAO,
      })
      .select("id")
      .single()
    if (error) throw new Error("Não foi possível registrar a extração.")
    execucaoId = run.id

    const municipio = Array.isArray(doc.municipality) ? doc.municipality[0] : doc.municipality
    const { saida, uso, modelo } = await extrairParametros(
      mensagemExtracao({
        municipio: municipio ? `${municipio.name}/${municipio.uf}` : "",
        documento: `${LEGAL_DOCUMENT_KIND[doc.kind]} nº ${doc.number}: ${doc.title}`,
        usoAlvo: LAND_USE[dados.usoAlvo],
        zonasCadastradas: (zonas ?? []).map((z) => z.code),
        instrucoes: dados.instrucoes || null,
        paginas: comTexto.map((p) => ({ numero: p.page_number, texto: p.content })),
      }),
    )
    await supabase
      .from("extraction_runs")
      .update({
        status: "concluida",
        model: modelo,
        output: saida as unknown as Json,
        input_tokens: uso.entrada,
        output_tokens: uso.saida,
        cost_usd: uso.custoUsd,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)

    const aplicado = await aplicarExtracao(run.id)
    const aviso = semTexto > 0 ? ` ${semTexto} páginas sem texto ficaram de fora.` : ""
    refresh()
    return aplicado.ok
      ? {
          ...aplicado,
          mensagem: `${aplicado.mensagem}${aviso} Custo: US$ ${(uso.custoUsd ?? 0).toFixed(2)}.`,
          execucaoId,
        }
      : { ...aplicado, execucaoId }
  } catch (e) {
    if (execucaoId) {
      await supabase
        .from("extraction_runs")
        .update({
          status: "erro",
          error: e instanceof Error ? e.message.slice(0, 1000) : "Erro.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", execucaoId)
    }
    return { ...falha(e), execucaoId }
  }
}

/**
 * Cria (ou atualiza) um rascunho por zona encontrada. Nunca valida: a regra só
 * alimenta o motor depois da homologação. Pode ser chamada de novo depois de
 * cadastrar as zonas que faltavam.
 */
export async function aplicarExtracao(
  execucaoId: string,
): Promise<ResultadoEtapa & { zonasFaltantes?: number }> {
  try {
    const supabase = await admin()
    const { data: run, error } = await supabase
      .from("extraction_runs")
      .select("id, legal_document_id, target_use, output, status, pages")
      .eq("id", execucaoId)
      .single()
    if (error || run.status !== "concluida") return { ok: false, erro: "Extração não concluída." }
    const saida = saidaExtracaoSchema.parse(run.output)
    const doc = await documento(supabase, run.legal_document_id)

    const vizinhas = new Set(run.pages.flatMap((p) => [p - 1, p, p + 1]))
    const [{ data: zonas }, { data: paginas }, { data: existentes }] = await Promise.all([
      supabase.from("zones").select("id, code").eq("municipality_id", doc.municipality_id),
      supabase
        .from("legal_document_pages")
        .select("page_number, content")
        .eq("legal_document_id", doc.id)
        .in("page_number", [...vizinhas]),
      supabase
        .from("zoning_rules")
        .select("id, zone_id, use_type")
        .eq("extraction_run_id", run.id)
        .eq("status", "rascunho"),
    ])

    const { rascunhos, zonasNaoCadastradas } = montarRascunhos(saida, {
      usoAlvo: run.target_use,
      documentoId: doc.id,
      zonas: zonas ?? [],
      paginas: new Map((paginas ?? []).map((p) => [p.page_number, p.content])),
    })

    let criados = 0
    for (const r of rascunhos) {
      const anterior = (existentes ?? []).find(
        (e) => e.zone_id === r.zoneId && e.use_type === r.values.use_type,
      )
      const values = { permitted: true, ...r.values }
      const { data: id, error: e } = await supabase.rpc("admin_save_zoning_rule", {
        p_id: (anterior?.id ?? null) as unknown as string,
        p_zone_id: r.zoneId,
        p_data: values as Json,
        p_sources: r.sources as unknown as Json,
        p_validate: false,
      })
      if (e) throw new Error(`Não foi possível criar o rascunho da zona ${r.zonaCodigo}.`)
      await supabase
        .from("zoning_rules")
        .update({ extraction_run_id: run.id, extracted_values: r.extractedValues as Json })
        .eq("id", id)
      criados++
    }

    refresh()
    const faltam = zonasNaoCadastradas.length
    return {
      ok: true,
      mensagem: `${criados} rascunho(s) de regra criado(s)${faltam ? `; ${faltam} zona(s) não cadastrada(s)` : ""}.`,
      zonasFaltantes: faltam,
    }
  } catch (e) {
    return falha(e)
  }
}

/** Cadastra, sem geometria, as zonas que a extração encontrou e o sistema ainda não tinha; depois reaplica. */
export async function criarZonasDaExtracao(execucaoId: string): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const { data: run, error } = await supabase
      .from("extraction_runs")
      .select("legal_document_id, output")
      .eq("id", execucaoId)
      .single()
    if (error) return { ok: false, erro: "Extração não encontrada." }
    const saida = saidaExtracaoSchema.parse(run.output)
    const doc = await documento(supabase, run.legal_document_id)
    const { data: zonas } = await supabase
      .from("zones")
      .select("id, code")
      .eq("municipality_id", doc.municipality_id)
    const { zonasNaoCadastradas } = montarRascunhos(saida, {
      usoAlvo: "residencial_vertical",
      documentoId: doc.id,
      zonas: zonas ?? [],
      paginas: new Map(),
    })
    if (zonasNaoCadastradas.length === 0) return aplicarExtracao(execucaoId)
    const { error: e } = await supabase.from("zones").insert(
      zonasNaoCadastradas.map((z) => ({
        municipality_id: doc.municipality_id,
        code: z.codigo.slice(0, 40),
        name: z.nome.slice(0, 200),
        kind: "zona" as const,
        legal_document_id: doc.id,
      })),
    )
    if (e) throw new Error("Não foi possível cadastrar as zonas.")
    const aplicado = await aplicarExtracao(execucaoId)
    return aplicado.ok
      ? {
          ...aplicado,
          mensagem: `${zonasNaoCadastradas.length} zona(s) cadastrada(s) sem geometria. ${aplicado.mensagem}`,
        }
      : aplicado
  } catch (e) {
    return falha(e)
  }
}

// 7. Relações entre normas ---------------------------------------------------------------------

const relacaoSchema = z.object({
  outra: z.uuid("Escolha a outra norma."),
  sentido: z.enum(["esta_altera", "alterada_por"]),
  kind: z.enum(["altera", "revoga", "regulamenta", "consolida"]),
  articles: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(2000).nullable(),
})

export async function salvarRelacao(
  documentoId: string,
  entrada: z.input<typeof relacaoSchema>,
): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const r = relacaoSchema.parse(entrada)
    const [from, to] = r.sentido === "esta_altera" ? [documentoId, r.outra] : [r.outra, documentoId]
    const { error } = await supabase.from("legal_document_links").upsert(
      {
        from_document_id: from,
        to_document_id: to,
        kind: r.kind,
        articles: r.articles || null,
        notes: r.notes || null,
      },
      { onConflict: "from_document_id,to_document_id,kind" },
    )
    if (error) return { ok: false, erro: "Não foi possível salvar a relação." }
    refresh()
    return { ok: true, mensagem: "Relação salva." }
  } catch (e) {
    return falha(e)
  }
}

export async function removerRelacao(relacaoId: string): Promise<ResultadoEtapa> {
  try {
    const supabase = await admin()
    const { error } = await supabase.from("legal_document_links").delete().eq("id", relacaoId)
    if (error) return { ok: false, erro: "Não foi possível remover a relação." }
    refresh()
    return { ok: true, mensagem: "Relação removida." }
  } catch (e) {
    return falha(e)
  }
}

// 8. Leitura das páginas (para achar onde estão os parâmetros) ---------------------------------

export async function buscarNasPaginas(documentoId: string, termo: string) {
  return procurarNasPaginas(documentoId, termo)
}

export async function abrirPagina(documentoId: string, pagina: number) {
  if (!Number.isInteger(pagina) || pagina < 1) return null
  return lerPagina(documentoId, pagina)
}

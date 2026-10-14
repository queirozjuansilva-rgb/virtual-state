"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { requireAdmin } from "@/lib/auth/dal"
import {
  agruparPorAtributo,
  feicoesComNome,
  lerColecao,
  resumirCamada,
  siglaDaZona,
  textoDoAtributo,
  type ResumoCamada,
} from "@/lib/geo/importacao"
import type { Enums, Json } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/server"
import { baixarArquivoOficial } from "@/server/legislacao/download"

/**
 * Cartografia oficial (Fase 5): zonas e camadas de condicionantes importadas
 * por URL de portal público (ex.: Fortaleza em Mapas). O servidor baixa com as
 * mesmas defesas do PDF de lei, resume para o admin conferir e grava em lote.
 */

const MAX_BYTES_GEOJSON = 40 * 1024 * 1024
/** Feições por chamada ao banco: mantém cada lote abaixo do tempo limite de instrução. */
const LOTE = 150

type Resultado<T = object> = ({ ok: true; mensagem: string } & T) | { ok: false; erro: string }

async function admin() {
  await requireAdmin()
  return createClient()
}

async function baixarColecao(url: string) {
  const endereco = z
    .url({ protocol: /^https$/ })
    .max(2000)
    .parse(url.trim())
  const bytes = await baixarArquivoOficial(endereco, MAX_BYTES_GEOJSON)
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error("O endereço não devolveu JSON.")
  }
  return lerColecao(json)
}

function falha(e: unknown): { ok: false; erro: string } {
  if (e instanceof z.ZodError) return { ok: false, erro: "Informe um endereço https:// válido." }
  return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." }
}

export async function previsualizarCamada(
  url: string,
  atributoNome?: string,
): Promise<
  Resultado<{
    resumo: ResumoCamada
    zonas: { nome: string; sigla: string; feicoes: number; descricao: string }[]
  }>
> {
  try {
    await requireAdmin()
    const feicoes = await baixarColecao(url)
    const resumo = resumirCamada(feicoes)
    const zonas = atributoNome
      ? agruparPorAtributo(feicoes, atributoNome).map((g) => ({
          nome: g.valor,
          sigla: siglaDaZona(g.valor),
          feicoes: g.feicoes.length,
          descricao: textoDoAtributo(
            g.feicoes[0]?.properties?.descricao ?? g.feicoes[0]?.properties?.Descrição,
          ).slice(0, 600),
        }))
      : []
    return {
      ok: true,
      mensagem: `${resumo.feicoes} feições, ${resumo.poligonos} poligonais.`,
      resumo,
      zonas,
    }
  } catch (e) {
    return falha(e)
  }
}

const zonasSchema = z.object({
  municipioId: z.uuid(),
  url: z.string(),
  atributoNome: z.string().min(1),
  fonte: z.string().trim().min(3).max(300),
  documentoId: z.uuid().nullable(),
  siglas: z.record(z.string(), z.string().trim().min(1).max(40)),
})

/** Zonas: uma por valor do atributo (feições de mesmo nome são unidas). Atualiza as que já existem pelo código. */
export async function importarZonas(entrada: z.input<typeof zonasSchema>): Promise<Resultado> {
  try {
    const d = zonasSchema.parse(entrada)
    const supabase = await admin()
    const grupos = agruparPorAtributo(await baixarColecao(d.url), d.atributoNome)
    const coletadoEm = new Date().toLocaleDateString("pt-BR")
    const itens = grupos.map((g) => {
      const parametros = textoDoAtributo(g.feicoes[0]?.properties?.descricao)
      return {
        code: d.siglas[g.valor] ?? siglaDaZona(g.valor),
        name: g.valor,
        description: [
          `Geometria: ${d.fonte} (coletada em ${coletadoEm}).`,
          parametros && `Atributos da camada (fonte secundária, conferir com a lei): ${parametros}`,
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 2000),
        geojson: g.geometria,
      }
    })
    const codigos = itens.map((i) => i.code)
    if (new Set(codigos).size !== codigos.length)
      return { ok: false, erro: "Há siglas repetidas. Ajuste antes de importar." }
    const { data, error } = await supabase.rpc("admin_importar_zonas", {
      p_municipality_id: d.municipioId,
      p_itens: itens as unknown as Json,
      p_legal_document_id: (d.documentoId ?? null) as unknown as string,
    })
    if (error) return { ok: false, erro: "Não foi possível gravar as zonas." }
    refresh()
    return {
      ok: true,
      mensagem: `${data} zona(s) importada(s) ou atualizada(s). A zona dos terrenos foi recalculada.`,
    }
  } catch (e) {
    return falha(e)
  }
}

const camadaSchema = z.object({
  municipioId: z.uuid(),
  url: z.string(),
  kind: z.enum([
    "app",
    "area_alagavel",
    "zona_protecao_ambiental",
    "faixa_nao_edificavel",
    "faixa_dominio",
    "tombamento",
    "outro",
  ]),
  atributoNome: z.string().nullable(),
  prefixo: z.string().trim().max(80).nullable(),
  fonte: z.string().trim().min(3).max(300),
})

/** Condicionantes: uma linha por feição. Reimportar a mesma fonte substitui a anterior. */
export async function importarCamada(entrada: z.input<typeof camadaSchema>): Promise<Resultado> {
  try {
    const d = camadaSchema.parse(entrada)
    const supabase = await admin()
    const itens = feicoesComNome(await baixarColecao(d.url), d.atributoNome).map((f) => ({
      ...f,
      name: [d.prefixo, f.name].filter(Boolean).join(": ").slice(0, 200),
    }))
    if (itens.length === 0) return { ok: false, erro: "A camada não tem polígonos." }
    let total = 0
    for (let i = 0; i < itens.length; i += LOTE) {
      const { data, error } = await supabase.rpc("admin_importar_camadas", {
        p_municipality_id: d.municipioId,
        p_kind: d.kind as Enums<"environmental_layer_kind">,
        p_source: d.fonte,
        p_itens: itens.slice(i, i + LOTE) as unknown as Json,
        p_substituir: i === 0,
      })
      if (error)
        return {
          ok: false,
          erro: `Falha ao gravar o lote ${i / LOTE + 1}. Importação parcial: rode de novo.`,
        }
      total += data ?? 0
    }
    refresh()
    return { ok: true, mensagem: `${total} feições importadas de ${itens.length}.` }
  } catch (e) {
    return falha(e)
  }
}

/** Tira (ou devolve) os dados fictícios do seed das buscas, do copiloto e dos estudos. */
export async function arquivarFicticios(
  municipioId: string,
  arquivar: boolean,
): Promise<Resultado> {
  try {
    const supabase = await admin()
    const { data, error } = await supabase.rpc("admin_arquivar_ficticios", {
      p_municipality_id: z.uuid().parse(municipioId),
      p_arquivar: arquivar,
    })
    if (error) return { ok: false, erro: "Não foi possível atualizar os dados fictícios." }
    const c = data as Record<string, number>
    refresh()
    return {
      ok: true,
      mensagem: `${arquivar ? "Arquivados" : "Restaurados"}: ${c.zonas} zonas, ${c.terrenos} terrenos, ${c.comparaveis} comparáveis, ${c.camadas} camadas e ${c.documentos} lei(s).`,
    }
  } catch (e) {
    return falha(e)
  }
}

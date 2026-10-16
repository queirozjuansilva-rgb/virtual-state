import {
  estatisticaComparaveis,
  premissasSchema,
  type EntradaViabilidade,
  type Fonte,
  type Premissas,
  type RegraUrbanistica,
  type TipoRestricao,
  type Uso,
} from "@/lib/feasibility"
import { LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import type { Enums } from "@/lib/supabase/database.types"

import {
  formaAquisicaoDoTerreno,
  PADRAO_CUB_FALLBACK,
  PADRAO_CUB_POR_USO,
  TIPOLOGIA_POR_USO,
  type ConfigMotor,
} from "./config"

/**
 * Traduz os dados do banco (terreno, regra validada, CUB, comparáveis,
 * defaults) na entrada do motor, com a fonte de cada número. Sem I/O.
 */

export type RegraDb = {
  use_type: Uso
  permitted: boolean
  ca_basico: number | null
  ca_max: number | null
  to_max: number | null
  gabarito_m: number | null
  gabarito_pavimentos: number | null
  recuo_frontal: string | null
  recuo_lateral: string | null
  recuo_fundos: string | null
  lote_minimo_m2: number | null
  testada_minima_m: number | null
  outorga_fator: number | null
  rule_sources: {
    field: string
    article: string
    excerpt: string | null
    legal_document: {
      kind: Enums<"legal_document_kind">
      number: string
      is_fictitious: boolean
    } | null
  }[]
}

export type ContextoTerreno = {
  terreno: {
    id: string
    code: string
    area_m2: number | null
    area_informada_m2: number | null
    testada_principal_m: number | null
    esquina: boolean
    declividade_pct: number | null
    matricula_numero: string | null
    onus: string | null
    preco_pedido: number | null
    negociacao: Enums<"negotiation_type"> | null
    permuta_pct: number | null
    zone_assignment: Enums<"zone_assignment">
    zones_overlap_count: number
    zone: { id: string; code: string } | null
    uf: string
    tem_app: boolean
    tem_area_alagavel: boolean
    tem_faixa_dominio: boolean
    tem_tombamento: boolean
    tem_servidao: boolean
    is_fictitious: boolean
  }
  /** Regras validadas da zona do lote (todas os usos). */
  regras: RegraDb[]
  /** Tipos de camada que o município tem; sem o campo, o estudo não avalia a cobertura. */
  camadasDoMunicipio?: Enums<"environmental_layer_kind">[]
  hitsAmbientais: {
    kind: Enums<"environmental_layer_kind">
    name: string
    /** Null quando a análise é de um ponto (sem polígono do lote). */
    overlap_m2: number | null
    is_fictitious: boolean
  }[]
  /** CUB mais recente da UF por padrão. */
  cubs: Record<string, { value_m2: number; reference_month: string; source: string }>
  /** Preços R$/m² dos comparáveis por tipologia (já filtrados por raio e data). */
  comparaveis: Partial<Record<string, { price_m2: number; is_fictitious: boolean }[]>>
  config: ConfigMotor
  /** Início da janela de comparáveis (ISO). */
  desde: string
}

export type OpcoesEstudo = {
  uso: Uso
  /** Preço de venda informado pelo usuário (sobrescreve a mediana dos comparáveis). */
  precoVendaM2?: number | null
  usarCaMaximo?: boolean
}

export type EntradaMontada =
  | { ok: true; entrada: EntradaViabilidade; avisos: string[] }
  | { ok: false; pendencias: string[]; avisos: string[] }

const TIPO_RESTRICAO: Record<Enums<"environmental_layer_kind">, TipoRestricao> = {
  app: "app",
  area_alagavel: "area_alagavel",
  zona_protecao_ambiental: "zona_protecao_ambiental",
  faixa_nao_edificavel: "faixa_nao_edificavel",
  faixa_dominio: "faixa_dominio",
  tombamento: "tombamento",
  outro: "outro",
}

/** Tipos de camada cuja ausência no município vira aviso de dados insuficientes. */
const CAMADAS_AVALIADAS: Enums<"environmental_layer_kind">[] = [
  "app",
  "area_alagavel",
  "zona_protecao_ambiental",
  "faixa_dominio",
  "tombamento",
]

export function montarRegra(ctx: ContextoTerreno, uso: Uso): RegraUrbanistica {
  const linha = ctx.terreno.zone ? ctx.regras.find((r) => r.use_type === uso) : undefined
  if (!linha) {
    return {
      uso,
      status: "ausente",
      permitido: true,
      caBasico: null,
      caMaximo: null,
      toMax: null,
      gabaritoM: null,
      gabaritoPavimentos: null,
      recuoFrontal: null,
      recuoLateral: null,
      recuoFundos: null,
      loteMinimoM2: null,
      testadaMinimaM: null,
      outorgaFator: null,
      fontes: {},
    }
  }
  const fontes: RegraUrbanistica["fontes"] = {}
  for (const s of linha.rule_sources) {
    const doc = s.legal_document
    fontes[s.field as keyof RegraUrbanistica["fontes"]] = {
      tipo: "lei",
      documento: doc
        ? `${LEGAL_DOCUMENT_KIND[doc.kind]} nº ${doc.number}`
        : "Documento não encontrado",
      artigo: s.article,
      trecho: s.excerpt,
      ficticio: doc?.is_fictitious ?? false,
    }
  }
  const num = (v: number | string | null) => (v === null ? null : Number(v))
  return {
    uso,
    status: "validado",
    permitido: linha.permitted,
    caBasico: num(linha.ca_basico),
    caMaximo: num(linha.ca_max),
    toMax: num(linha.to_max),
    gabaritoM: num(linha.gabarito_m),
    gabaritoPavimentos: num(linha.gabarito_pavimentos),
    recuoFrontal: linha.recuo_frontal,
    recuoLateral: linha.recuo_lateral,
    recuoFundos: linha.recuo_fundos,
    loteMinimoM2: num(linha.lote_minimo_m2),
    testadaMinimaM: num(linha.testada_minima_m),
    outorgaFator: num(linha.outorga_fator),
    fontes,
  }
}

export function montarEntrada(ctx: ContextoTerreno, opcoes: OpcoesEstudo): EntradaMontada {
  const { terreno: t, config } = ctx
  const avisos: string[] = []
  const pendencias: string[] = []

  if (t.is_fictitious) avisos.push("Terreno fictício (dados de teste).")

  // Regra urbanística
  const regra = montarRegra(ctx, opcoes.uso)
  if (opcoes.uso === "misto") {
    // TODO(cliente): modelar a fachada ativa (preço de loja/sala no térreo).
    avisos.push(
      "Uso misto estimado como residencial (preço e CUB de apartamento); a fachada ativa ainda não é modelada.",
    )
  }
  if (Object.values(regra.fontes).some((f) => f.tipo === "lei" && f.ficticio)) {
    avisos.push("Parâmetros urbanísticos de lei fictícia (dados de teste).")
  }

  // Terreno
  const area = t.area_m2 === null ? null : Number(t.area_m2)
  if (area === null || !(area > 0)) pendencias.push("Área do terreno não informada.")
  const restricoes: EntradaViabilidade["terreno"]["restricoes"] = ctx.hitsAmbientais.map((h) => ({
    tipo: TIPO_RESTRICAO[h.kind],
    sobreposicaoM2: h.overlap_m2 === null ? null : Number(h.overlap_m2),
    origem: `${h.name}${h.is_fictitious ? " (camada fictícia)" : ""}`,
  }))
  // Sem camada oficial de um tipo, "nenhuma interseção" não prova nada.
  const camadasSemCobertura = ctx.camadasDoMunicipio
    ? CAMADAS_AVALIADAS.filter((k) => !ctx.camadasDoMunicipio!.includes(k)).map(
        (k) => TIPO_RESTRICAO[k],
      )
    : undefined
  const checklist: [boolean, TipoRestricao][] = [
    [t.tem_app, "app"],
    [t.tem_area_alagavel, "area_alagavel"],
    [t.tem_faixa_dominio, "faixa_dominio"],
    [t.tem_tombamento, "tombamento"],
    [t.tem_servidao, "servidao"],
  ]
  for (const [marcado, tipo] of checklist) {
    if (marcado) restricoes.push({ tipo, sobreposicaoM2: null, origem: "Checklist do cadastro" })
  }

  // CUB
  const padrao = PADRAO_CUB_POR_USO[opcoes.uso]
  let cub = ctx.cubs[padrao]
  let padraoUsado = padrao
  if (!cub && ctx.cubs[PADRAO_CUB_FALLBACK]) {
    cub = ctx.cubs[PADRAO_CUB_FALLBACK]
    padraoUsado = PADRAO_CUB_FALLBACK
    avisos.push(
      `CUB ${padrao} não cadastrado para ${t.uf}: usado o ${PADRAO_CUB_FALLBACK} como aproximação.`,
    )
  }
  if (!cub) pendencias.push(`Nenhum CUB cadastrado para ${t.uf}.`)

  // Preço de venda
  const tipologia = TIPOLOGIA_POR_USO[opcoes.uso]
  const amostras = ctx.comparaveis[tipologia] ?? []
  const estatistica = estatisticaComparaveis(amostras.map((a) => Number(a.price_m2)))
  if (amostras.some((a) => a.is_fictitious)) avisos.push("Comparáveis fictícios (dados de teste).")
  let precoVendaM2: number | null = null
  let fontePreco: Fonte | null = null
  if (opcoes.precoVendaM2 != null && opcoes.precoVendaM2 > 0) {
    precoVendaM2 = opcoes.precoVendaM2
    fontePreco = { tipo: "premissa_usuario", observacao: "Preço de venda informado no estudo." }
  } else if (estatistica) {
    precoVendaM2 = estatistica.medianaM2
    fontePreco = {
      tipo: "comparaveis",
      n: estatistica.n,
      raioM: config.mercado.raioM,
      desde: ctx.desde,
      tipologia,
      ficticio: amostras.some((a) => a.is_fictitious),
    }
  } else {
    pendencias.push(
      `Sem comparáveis de ${tipologia.replace("_", " ")} num raio de ${config.mercado.raioM} m: informe o preço de venda.`,
    )
  }

  // Premissas
  const formaDoTerreno = formaAquisicaoDoTerreno(t.negociacao)
  const premissas: Premissas = {
    ...config.premissas,
    usarCaMaximo: opcoes.usarCaMaximo ?? config.premissas.usarCaMaximo,
    cubM2: cub ? Number(cub.value_m2) : 0,
    precoTerreno: t.preco_pedido === null ? 0 : Number(t.preco_pedido),
    formaAquisicao: formaDoTerreno ?? config.premissas.formaAquisicao,
    permutaPct: t.permuta_pct === null ? config.premissas.permutaPct : Number(t.permuta_pct),
  }

  const validacao = premissasSchema.safeParse(premissas)
  if (!validacao.success) {
    for (const issue of validacao.error.issues) {
      if (issue.path[0] === "cubM2" && !cub) continue
      pendencias.push(issue.message)
    }
  }

  if (pendencias.length > 0 || area === null || precoVendaM2 === null || !fontePreco || !cub) {
    return { ok: false, pendencias, avisos }
  }

  const fontes: EntradaViabilidade["fontes"] = {}
  for (const [chave, origem] of Object.entries(config.origens)) {
    fontes[chave as keyof Premissas] = {
      tipo: "default_calibrado",
      chave,
      observacao: origem,
    }
  }
  fontes.cubM2 = {
    tipo: "cub",
    uf: t.uf,
    padrao: padraoUsado,
    mesReferencia: cub.reference_month.slice(0, 7),
    origem: cub.source,
  }
  fontes.precoTerreno = { tipo: "dado_terreno", campo: "preco_pedido" }
  if (formaDoTerreno) fontes.formaAquisicao = { tipo: "dado_terreno", campo: "negociacao" }
  if (t.permuta_pct !== null) fontes.permutaPct = { tipo: "dado_terreno", campo: "permuta_pct" }
  if (opcoes.usarCaMaximo !== undefined) fontes.usarCaMaximo = { tipo: "premissa_usuario" }

  return {
    ok: true,
    avisos,
    entrada: {
      terreno: {
        areaM2: area,
        testadaM: t.testada_principal_m === null ? null : Number(t.testada_principal_m),
        esquina: t.esquina,
        declividadePct: t.declividade_pct === null ? null : Number(t.declividade_pct),
        matriculaInformada: Boolean(t.matricula_numero?.trim()),
        onusRegistrado: Boolean(t.onus?.trim()),
        restricoes,
        ...(camadasSemCobertura ? { camadasSemCobertura } : {}),
        zona: {
          codigo: t.zone?.code ?? null,
          atribuicao: t.zone === null ? "nenhuma" : t.zone_assignment,
          zonasCruzadas: t.zones_overlap_count,
        },
      },
      regra,
      mercado: { precoVendaM2, fontePreco, comparaveis: estatistica },
      premissas,
      fontes,
      cenarios: config.cenarios,
      risco: config.risco,
    },
  }
}

import { LAND_USE } from "@/lib/domain/labels"
import type { Uso } from "@/lib/feasibility"
import type { ContextoEstudo } from "@/lib/relatorio/tipos"
import type { Enums } from "@/lib/supabase/database.types"
import { contextoDePonto } from "@/server/feasibility/carregar-contexto"
import { inicioJanela, montarConfig, type LinhaPeso } from "@/server/feasibility/config"
import type { ContextoTerreno } from "@/server/feasibility/montar-entrada"

import type {
  CandidatoEndereco,
  DadosCopiloto,
  PontoBruto,
  RegraComZona,
  RegraCompleta,
  TerrenoBruto,
} from "../../dados"
import seed from "./seed.json"

/**
 * DadosCopiloto em memória a partir do snapshot do seed (seed.json). Usado
 * nos testes das ferramentas e nos evals: mesmas respostas, sem banco.
 * Gravações (análises, pedidos de cobertura) ficam em `registros`.
 */

type Tipologia = Enums<"comparable_typology">
type LinhaRegraSeed = (typeof seed.regras)[number]

const CAMPOS_REGRA = [
  "ca_min",
  "ca_basico",
  "ca_max",
  "to_max",
  "permeabilidade_min",
  "gabarito_m",
  "gabarito_pavimentos",
  "recuo_frontal",
  "recuo_lateral",
  "recuo_fundos",
  "lote_minimo_m2",
  "testada_minima_m",
  "outorga_fator",
] as const

const municipio = seed.municipios[0]
const zonaPorCodigo = new Map(seed.zonas.map((z) => [z.code, z]))

function regraCompleta(r: LinhaRegraSeed): RegraComZona {
  const zona = zonaPorCodigo.get(r.zone)!
  const valores = r as Partial<Record<(typeof CAMPOS_REGRA)[number], number | string | null>>
  const fonte = (campo: string, valor: unknown) => ({
    field: campo,
    article: `Anexo II, Tabela ${r.zone} (fictício)`,
    excerpt: `Trecho fictício para testes: ${campo} = ${String(valor)} para ${r.use_type} na ${r.zone}.`,
    legal_document: {
      kind: seed.documento.kind as Enums<"legal_document_kind">,
      number: seed.documento.number,
      is_fictitious: seed.documento.is_fictitious,
    },
  })
  const regra: RegraCompleta = {
    use_type: r.use_type as Uso,
    use_label_local: null,
    permitted: r.permitted,
    ca_min: null,
    ca_basico: (valores.ca_basico as number) ?? null,
    ca_max: (valores.ca_max as number) ?? null,
    to_max: (valores.to_max as number) ?? null,
    permeabilidade_min: (valores.permeabilidade_min as number) ?? null,
    gabarito_m: (valores.gabarito_m as number) ?? null,
    gabarito_pavimentos: (valores.gabarito_pavimentos as number) ?? null,
    recuo_frontal: (valores.recuo_frontal as string) ?? null,
    recuo_lateral: (valores.recuo_lateral as string) ?? null,
    recuo_fundos: (valores.recuo_fundos as string) ?? null,
    lote_minimo_m2: (valores.lote_minimo_m2 as number) ?? null,
    testada_minima_m: (valores.testada_minima_m as number) ?? null,
    outorga_fator: (valores.outorga_fator as number) ?? null,
    outorga_formula: null,
    observacoes: "Regra fictícia (seed). H = altura da edificação em metros.",
    rule_sources: [
      fonte("permitted", r.permitted),
      ...CAMPOS_REGRA.flatMap((c) =>
        valores[c] === undefined || valores[c] === null ? [] : [fonte(c, valores[c])],
      ),
    ],
  }
  return { zona: { id: zona.id, code: zona.code, name: zona.name }, regra }
}

const REGRAS = seed.regras.map(regraCompleta)

function regrasDaZona(zoneId: string): RegraComZona[] {
  return REGRAS.filter((r) => r.zona.id === zoneId).sort((a, b) =>
    a.regra.use_type.localeCompare(b.regra.use_type),
  )
}

const TERRENOS: TerrenoBruto[] = seed.terrenos.map((t) => {
  const zona = t.zone ? zonaPorCodigo.get(t.zone)! : null
  return {
    id: t.id,
    code: t.code,
    address: t.address,
    neighborhood: t.neighborhood,
    municipality: { id: municipio.id, name: municipio.name, uf: municipio.uf },
    area_m2: t.area_m2,
    testada_principal_m: t.testada_principal_m,
    esquina: t.esquina,
    topografia: t.topografia as Enums<"topography">,
    declividade_pct: t.declividade_pct,
    matricula_numero: t.matricula_numero,
    onus: t.onus,
    status: t.status as Enums<"land_status">,
    preco_pedido: t.preco_pedido,
    negociacao: t.negociacao as Enums<"negotiation_type">,
    permuta_pct: t.permuta_pct,
    zone: zona ? { id: zona.id, code: zona.code, name: zona.name } : null,
    zone_assignment: "automatica",
    zones_overlap_count: t.zones_overlap_count,
    tem_app: false,
    tem_area_alagavel: false,
    tem_faixa_dominio: false,
    tem_tombamento: false,
    tem_servidao: false,
    observacoes: t.observacoes,
    is_fictitious: true,
    usos_permitidos: zona
      ? regrasDaZona(zona.id)
          .filter((r) => r.regra.permitted)
          .map((r) => r.regra.use_type)
      : [],
  }
})

type PorTerreno = {
  restricoes: { kind: string; name: string; is_fictitious: boolean; overlap_m2: number }[]
  zonas: [string, number][]
  comparaveis: Partial<Record<Tipologia, number[]>>
}
const porTerreno = seed.porTerreno as unknown as Record<string, PorTerreno>

const config = montarConfig(
  seed.defaults.map(([key, value, source]) => ({
    key: key as string,
    value,
    source: source as string,
  })),
  seed.pesos.map(([flag_code, axis, weight, label]): LinhaPeso => ({
    flag_code: flag_code as string,
    axis: axis as LinhaPeso["axis"],
    weight: weight as number,
    label: label as string,
    active: true,
  })),
)

const cubs: ContextoTerreno["cubs"] = Object.fromEntries(
  seed.cubs.map((c) => [
    c.standard,
    { value_m2: c.value_m2, reference_month: c.reference_month, source: c.source },
  ]),
)

function amostras(precos: number[] | undefined) {
  return (precos ?? []).map((price_m2) => ({ price_m2, is_fictitious: true }))
}

function comparaveisDe(
  origem: Partial<Record<Tipologia, number[]>>,
): ContextoTerreno["comparaveis"] {
  const tipologias: Tipologia[] = ["apartamento", "casa", "sala_comercial", "loja", "lote", "outro"]
  return Object.fromEntries(tipologias.map((t) => [t, amostras(origem[t])]))
}

function pontoDoSeed(longitude: number, latitude: number) {
  return seed.pontos.find(
    (p) => Math.abs(p.longitude - longitude) < 1e-4 && Math.abs(p.latitude - latitude) < 1e-4,
  )
}

/**
 * Geocodificação de teste: endereços fictícios que caem nos pontos do seed.
 * Qualquer outro endereço não é encontrado.
 */
const ENDERECOS: { chave: string; candidato: CandidatoEndereco }[] = [
  {
    chave: "rua de teste k",
    candidato: {
      descricao: "Rua de Teste K, 10 - Aldeota, Fortaleza - CE",
      longitude: -38.498,
      latitude: -3.74,
      tipo: "address",
      numero: "10",
      relevancia: 1,
    },
  },
  {
    chave: "rua de teste l",
    candidato: {
      descricao: "Rua de Teste L - Cocó, Fortaleza - CE",
      longitude: -38.487,
      latitude: -3.755,
      tipo: "address",
      numero: null,
      relevancia: 0.8,
    },
  },
]

export type RegistrosFixture = {
  analises: { landId: string | null; contexto: ContextoEstudo }[]
  coberturas: { municipio: string; uf: string; endereco: string | null }[]
}

export function criarDadosFixture(): DadosCopiloto & { registros: RegistrosFixture } {
  const registros: RegistrosFixture = { analises: [], coberturas: [] }
  const desde = inicioJanela(config, new Date(`${seed.hoje}T12:00:00Z`))

  function analisarPonto(longitude: number, latitude: number): PontoBruto {
    const p = pontoDoSeed(longitude, latitude)
    const zona = p ? zonaPorCodigo.get(p.zona)! : null
    return {
      zona,
      municipio: zona ? municipio : null,
      camadas: (p?.camadas ?? []) as PontoBruto["camadas"],
    }
  }

  return {
    registros,
    async listarTerrenos() {
      return TERRENOS
    },
    async obterTerreno(ref) {
      return (
        TERRENOS.find((t) =>
          ref.id ? t.id === ref.id : t.code.toUpperCase() === ref.codigo?.toUpperCase(),
        ) ?? null
      )
    },
    async zonasCruzadas(landId) {
      return (porTerreno[landId]?.zonas ?? []).map(([code, overlap_ratio]) => ({
        code,
        overlap_ratio,
      }))
    },
    async restricoesDoTerreno(landId) {
      return (porTerreno[landId]?.restricoes ?? []) as Awaited<
        ReturnType<DadosCopiloto["restricoesDoTerreno"]>
      >
    },
    async analisarPonto(longitude, latitude) {
      return analisarPonto(longitude, latitude)
    },
    async zona(zoneId) {
      return seed.zonas.find((z) => z.id === zoneId) ?? null
    },
    async regraValidada(zoneId, uso) {
      return REGRAS.find((r) => r.zona.id === zoneId && r.regra.use_type === uso) ?? null
    },
    async regrasValidadas(zoneId) {
      return regrasDaZona(zoneId)
    },
    async municipios() {
      return seed.municipios
    },
    async contarTrechosLegais() {
      return 0
    },
    async buscarTextoLegal() {
      return []
    },
    async comparaveisTerreno(landId, tipologia) {
      return amostras(porTerreno[landId]?.comparaveis[tipologia])
    },
    async comparaveisPonto(longitude, latitude, tipologia) {
      const p = pontoDoSeed(longitude, latitude)
      return amostras(
        (p?.comparaveis as Partial<Record<Tipologia, number[]>> | undefined)?.[tipologia],
      )
    },
    async cubMaisRecente(uf, padrao) {
      const c = seed.cubs.find((x) => x.uf === uf && x.standard === padrao)
      return c
        ? { value_m2: c.value_m2, reference_month: c.reference_month, source: c.source }
        : null
    },
    async configMotor() {
      return config
    },
    async contextoTerreno(landId) {
      const t = TERRENOS.find((x) => x.id === landId)
      if (!t) return null
      return {
        terreno: {
          id: t.id,
          code: t.code,
          area_m2: t.area_m2,
          area_informada_m2: null,
          testada_principal_m: t.testada_principal_m,
          esquina: t.esquina,
          declividade_pct: t.declividade_pct,
          matricula_numero: t.matricula_numero,
          onus: t.onus,
          preco_pedido: t.preco_pedido,
          negociacao: t.negociacao,
          permuta_pct: t.permuta_pct,
          zone_assignment: t.zone_assignment,
          zones_overlap_count: t.zones_overlap_count,
          zone: t.zone ? { id: t.zone.id, code: t.zone.code } : null,
          uf: t.municipality.uf,
          tem_app: t.tem_app,
          tem_area_alagavel: t.tem_area_alagavel,
          tem_faixa_dominio: t.tem_faixa_dominio,
          tem_tombamento: t.tem_tombamento,
          tem_servidao: t.tem_servidao,
          is_fictitious: t.is_fictitious,
        },
        regras: t.zone ? regrasDaZona(t.zone.id).map((r) => r.regra) : [],
        hitsAmbientais: (porTerreno[landId]?.restricoes ?? []) as ContextoTerreno["hitsAmbientais"],
        cubs,
        comparaveis: comparaveisDe(porTerreno[landId]?.comparaveis ?? {}),
        config,
        desde,
      }
    },
    async contextoPonto(params) {
      const ponto = analisarPonto(params.longitude, params.latitude)
      if (!ponto.zona || !ponto.municipio) return null
      const p = pontoDoSeed(params.longitude, params.latitude)
      return contextoDePonto({
        ...params,
        ponto,
        regras: regrasDaZona(ponto.zona.id).map((r) => r.regra),
        config,
        cubs,
        comparaveis: comparaveisDe((p?.comparaveis ?? {}) as Partial<Record<Tipologia, number[]>>),
        desde,
      })
    },
    async registrarAnalise({ landId, contexto }) {
      registros.analises.push({ landId, contexto })
      return `a0a0a0a0-0000-4000-8000-${String(registros.analises.length).padStart(12, "0")}`
    },
    async solicitarCobertura(params) {
      registros.coberturas.push(params)
      return `c0be7a6e-0000-4000-8000-${String(registros.coberturas.length).padStart(12, "0")}`
    },
    async criarRelatorio(analysisRunId) {
      const i = Number(analysisRunId.slice(-12)) - 1
      const analise = registros.analises[i]
      if (!analysisRunId.startsWith("a0a0a0a0-") || !analise) return null
      return {
        id: `f0f0f0f0-0000-4000-8000-${analysisRunId.slice(-12)}`,
        titulo: `${analise.contexto.referencia} · ${LAND_USE[analise.contexto.uso]}`,
      }
    },
    async geocodificar(endereco) {
      const texto = endereco
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
      return ENDERECOS.filter((e) => texto.includes(e.chave)).map((e) => e.candidato)
    },
    hoje() {
      return seed.hoje
    },
  }
}

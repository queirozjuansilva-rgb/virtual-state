import type { EntradaViabilidade, ResultadoViabilidade, Uso } from "@/lib/feasibility"
import type { Enums } from "@/lib/supabase/database.types"
import type { ConfigMotor } from "@/server/feasibility/config"
import type { ContextoTerreno, RegraDb } from "@/server/feasibility/montar-entrada"

/**
 * Acesso a dados das ferramentas do copiloto. Em produção é o Supabase com a
 * RLS do usuário (src/server/copiloto/dados-supabase.ts); nos evals, um
 * fixture em memória com os dados do seed (src/lib/ai/evals/dados-fixture.ts).
 * Contato do proprietário nunca passa por aqui.
 */

export type TerrenoBruto = {
  id: string
  code: string
  address: string
  neighborhood: string | null
  municipality: { id: string; name: string; uf: string }
  area_m2: number | null
  testada_principal_m: number | null
  esquina: boolean
  topografia: Enums<"topography"> | null
  declividade_pct: number | null
  matricula_numero: string | null
  onus: string | null
  status: Enums<"land_status">
  preco_pedido: number | null
  negociacao: Enums<"negotiation_type"> | null
  permuta_pct: number | null
  zone: { id: string; code: string; name: string } | null
  zone_assignment: Enums<"zone_assignment">
  zones_overlap_count: number
  tem_app: boolean
  tem_area_alagavel: boolean
  tem_faixa_dominio: boolean
  tem_tombamento: boolean
  tem_servidao: boolean
  observacoes: string | null
  is_fictitious: boolean
  /** Usos com regra validada e permitida na zona do lote. */
  usos_permitidos: Uso[]
}

export type RestricaoBruta = {
  kind: Enums<"environmental_layer_kind">
  name: string
  is_fictitious: boolean
  overlap_m2: number | null
}

export type PontoBruto = {
  zona: { id: string; code: string; name: string; municipality_id: string } | null
  municipio: { id: string; name: string; uf: string; coverage_status: string } | null
  camadas: { kind: Enums<"environmental_layer_kind">; name: string; is_fictitious: boolean }[]
}

/** Regra validada com os campos que o motor não usa, mas o copiloto exibe. */
export type RegraCompleta = RegraDb & {
  ca_min: number | null
  permeabilidade_min: number | null
  outorga_formula: string | null
  use_label_local: string | null
  observacoes: string | null
}

export type RegraComZona = {
  zona: { id: string; code: string; name: string }
  regra: RegraCompleta
}

export type TrechoLegal = {
  documento: string
  article: string | null
  content: string
  is_fictitious: boolean
}

export type AmostraPreco = { price_m2: number; is_fictitious: boolean }

export type MunicipioBruto = { id: string; name: string; uf: string; coverage_status: string }

/** Resultado da geocodificação de um endereço digitado. */
export type CandidatoEndereco = {
  descricao: string
  longitude: number
  latitude: number
  /** Tipo do lugar encontrado (address, road, poi, neighbourhood, municipality…). */
  tipo: string
  /** Número do imóvel, quando o resultado chegou ao número. */
  numero: string | null
  /** 0–1: quanto o resultado corresponde ao texto buscado. */
  relevancia: number
}

export type RefTerreno = { id?: string; codigo?: string }

export interface DadosCopiloto {
  listarTerrenos(): Promise<TerrenoBruto[]>
  obterTerreno(ref: RefTerreno): Promise<TerrenoBruto | null>
  zonasCruzadas(landId: string): Promise<{ code: string; overlap_ratio: number }[]>
  restricoesDoTerreno(landId: string): Promise<RestricaoBruta[]>
  analisarPonto(longitude: number, latitude: number): Promise<PontoBruto>
  zona(
    zoneId: string,
  ): Promise<{ id: string; code: string; name: string; municipality_id: string } | null>
  regraValidada(zoneId: string, uso: Uso): Promise<RegraComZona | null>
  /** Todas as regras validadas da zona (um item por uso). */
  regrasValidadas(zoneId: string): Promise<RegraComZona[]>
  municipios(): Promise<MunicipioBruto[]>
  contarTrechosLegais(municipioId: string): Promise<number>
  buscarTextoLegal(municipioId: string, pergunta: string): Promise<TrechoLegal[]>
  comparaveisTerreno(
    landId: string,
    tipologia: Enums<"comparable_typology">,
    raioM: number,
    desde: string,
  ): Promise<AmostraPreco[]>
  comparaveisPonto(
    longitude: number,
    latitude: number,
    tipologia: Enums<"comparable_typology">,
    raioM: number,
    desde: string,
  ): Promise<AmostraPreco[]>
  cubMaisRecente(
    uf: string,
    padrao: string,
  ): Promise<{ value_m2: number; reference_month: string; source: string } | null>
  configMotor(): Promise<ConfigMotor>
  contextoTerreno(landId: string, usos?: Uso[]): Promise<ContextoTerreno | null>
  contextoPonto(params: {
    longitude: number
    latitude: number
    areaM2: number
    testadaM: number | null
    precoTerreno: number | null
    usos: Uso[]
  }): Promise<ContextoTerreno | null>
  registrarAnalise(params: {
    landId: string | null
    entrada: EntradaViabilidade
    resultado: ResultadoViabilidade
  }): Promise<string | null>
  solicitarCobertura(params: {
    municipio: string
    uf: string
    endereco: string | null
  }): Promise<string>
  /** Geocodifica um endereço no Brasil. null = serviço não configurado. */
  geocodificar(endereco: string): Promise<CandidatoEndereco[] | null>
  /** Data de hoje (ISO), injetável para testes determinísticos. */
  hoje(): string
}

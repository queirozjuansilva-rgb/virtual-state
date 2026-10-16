import {
  CENARIOS_PADRAO,
  PREMISSAS_PADRAO,
  RISCO_PADRAO,
  type Cenarios,
  type ChavePremissa,
  type CodigoFlag,
  type ConfigRisco,
  type EixoRisco,
  type Premissas,
  type Uso,
} from "@/lib/feasibility"
import { hojeISO, somarMeses } from "@/lib/format"

/**
 * Configuração do motor vinda do banco (feasibility_defaults e risk_weights).
 * Sem I/O: recebe as linhas e devolve a configuração, caindo nos defaults do
 * código para o que faltar. Testável.
 */

/** Chave em feasibility_defaults de cada premissa (snake_case). */
export const CHAVES_DEFAULTS: Record<Exclude<ChavePremissa, "cubM2" | "precoTerreno">, string> = {
  usarCaMaximo: "premissa.usar_ca_maximo",
  eficiencia: "premissa.eficiencia",
  areaNaoComputavelPct: "premissa.area_nao_computavel_pct",
  equivalenciaNaoComputavel: "premissa.equivalencia_nao_computavel",
  peDireitoM: "premissa.pe_direito_m",
  fatorCub: "premissa.fator_cub",
  formaAquisicao: "premissa.forma_aquisicao",
  permutaPct: "premissa.permuta_pct",
  itbiPct: "premissa.itbi_pct",
  registroPct: "premissa.registro_pct",
  projetosPct: "premissa.projetos_pct",
  marketingPct: "premissa.marketing_pct",
  corretagemPct: "premissa.corretagem_pct",
  administracaoPct: "premissa.administracao_pct",
  contingenciaPct: "premissa.contingencia_pct",
  impostosPct: "premissa.impostos_pct",
  prazoAprovacaoMeses: "premissa.prazo_aprovacao_meses",
  prazoObraMeses: "premissa.prazo_obra_meses",
  prazoVendasMeses: "premissa.prazo_vendas_meses",
  vendasNoLancamentoPct: "premissa.vendas_no_lancamento_pct",
  recebimentoSinalPct: "premissa.recebimento_sinal_pct",
  recebimentoObraPct: "premissa.recebimento_obra_pct",
  recebimentoChavesPct: "premissa.recebimento_chaves_pct",
  curvaObra: "premissa.curva_obra",
  declividadeAcentuadaPct: "premissa.declividade_acentuada_pct",
  nMinimoComparaveis: "premissa.n_minimo_comparaveis",
  cvMaximoComparaveis: "premissa.cv_maximo_comparaveis",
  margemMinimaConservador: "premissa.margem_minima_conservador",
}

export const CHAVES_CENARIOS = {
  "cenario.conservador.preco": ["conservador", "preco"],
  "cenario.conservador.custo": ["conservador", "custo"],
  "cenario.conservador.prazo_vendas": ["conservador", "prazoVendas"],
  "cenario.otimista.preco": ["otimista", "preco"],
  "cenario.otimista.custo": ["otimista", "custo"],
  "cenario.otimista.prazo_vendas": ["otimista", "prazoVendas"],
} as const

export const MERCADO_PADRAO = { raioM: 1500, janelaMeses: 24 }

export type LinhaDefault = { key: string; value: unknown; source: string }
export type LinhaPeso = {
  flag_code: string
  axis: EixoRisco
  weight: number
  label: string
  active: boolean
}

export type PremissasBase = Omit<Premissas, "cubM2" | "precoTerreno">

export type ConfigMotor = {
  premissas: PremissasBase
  /** Origem de cada premissa base (texto do campo source da tabela). */
  origens: Partial<Record<ChavePremissa, string>>
  cenarios: Cenarios
  risco: ConfigRisco
  mercado: { raioM: number; janelaMeses: number }
}

function mesmoTipo(padrao: unknown, valor: unknown): boolean {
  return typeof padrao === typeof valor && (typeof valor !== "number" || Number.isFinite(valor))
}

export function montarConfig(defaults: LinhaDefault[], pesos: LinhaPeso[]): ConfigMotor {
  const porChave = new Map(defaults.map((d) => [d.key, d]))

  const premissas: Record<string, unknown> = { ...PREMISSAS_PADRAO }
  const origens: Partial<Record<ChavePremissa, string>> = {}
  for (const [campo, chave] of Object.entries(CHAVES_DEFAULTS) as [
    keyof typeof CHAVES_DEFAULTS,
    string,
  ][]) {
    const linha = porChave.get(chave)
    if (linha && mesmoTipo(PREMISSAS_PADRAO[campo], linha.value)) {
      premissas[campo] = linha.value
      origens[campo] = linha.source
    }
  }

  const cenarios: Cenarios = {
    conservador: { ...CENARIOS_PADRAO.conservador },
    otimista: { ...CENARIOS_PADRAO.otimista },
  }
  for (const [chave, [cenario, campo]] of Object.entries(CHAVES_CENARIOS)) {
    const valor = porChave.get(chave)?.value
    if (typeof valor === "number" && Number.isFinite(valor)) cenarios[cenario][campo] = valor
  }

  const numero = (chave: string, padrao: number) => {
    const valor = porChave.get(chave)?.value
    return typeof valor === "number" && Number.isFinite(valor) ? valor : padrao
  }

  const pesosRisco = { ...RISCO_PADRAO.pesos }
  for (const linha of pesos) {
    if (!(linha.flag_code in pesosRisco)) continue
    pesosRisco[linha.flag_code as CodigoFlag] = {
      eixo: linha.axis,
      peso: linha.active ? Number(linha.weight) : 0,
      rotulo: linha.label,
    }
  }

  return {
    premissas: premissas as PremissasBase,
    origens,
    cenarios,
    risco: {
      pesos: pesosRisco,
      limiarMedio: numero("risco.limiar_medio", RISCO_PADRAO.limiarMedio),
      limiarAlto: numero("risco.limiar_alto", RISCO_PADRAO.limiarAlto),
    },
    mercado: {
      raioM: numero("mercado.raio_m", MERCADO_PADRAO.raioM),
      janelaMeses: numero("mercado.janela_meses", MERCADO_PADRAO.janelaMeses),
    },
  }
}

/** Início (ISO) da janela de comparáveis contada a partir de `hoje` (data em Fortaleza). */
export function inicioJanela(config: Pick<ConfigMotor, "mercado">, hoje = hojeISO()): string {
  return somarMeses(hoje, -config.mercado.janelaMeses)
}

/** Tipologia de comparável usada para o preço de venda de cada uso. */
export const TIPOLOGIA_POR_USO: Record<
  Uso,
  "apartamento" | "casa" | "sala_comercial" | "loja" | "lote" | "outro"
> = {
  residencial_vertical: "apartamento",
  residencial_horizontal: "casa",
  comercial: "sala_comercial",
  servicos: "sala_comercial",
  // TODO(cliente): misto como residencial (a fachada ativa entra quando houver comparável de loja).
  misto: "apartamento",
  industrial: "outro",
  institucional: "outro",
}

/** Projeto-padrão do CUB (NBR 12721) por uso. */
export const PADRAO_CUB_POR_USO: Record<Uso, string> = {
  residencial_vertical: "R8-N",
  residencial_horizontal: "R1-N",
  comercial: "CSL8-N",
  servicos: "CSL8-N",
  misto: "R8-N",
  industrial: "GI",
  institucional: "CSL8-N",
}

/** Padrão usado quando o específico do uso não está cadastrado (com aviso). */
export const PADRAO_CUB_FALLBACK = "R8-N"

/** Forma de aquisição a partir da negociação cadastrada no terreno. */
export function formaAquisicaoDoTerreno(
  negociacao: "dinheiro" | "permuta_fisica" | "permuta_financeira" | "misto" | null,
): Premissas["formaAquisicao"] | null {
  switch (negociacao) {
    case "dinheiro":
      return "compra"
    case "permuta_fisica":
    case "permuta_financeira":
    case "misto":
      return negociacao
    default:
      return null
  }
}

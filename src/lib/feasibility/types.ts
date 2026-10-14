/**
 * Tipos do motor de viabilidade (ADR 0007). TypeScript puro: nada de banco,
 * framework ou IA. Frações sempre em 0–1; áreas em m²; valores em R$; prazos
 * em meses.
 */

export type Uso =
  | "residencial_vertical"
  | "residencial_horizontal"
  | "comercial"
  | "servicos"
  | "misto"
  | "industrial"
  | "institucional"

// Rastreabilidade (princípio 3 do PRD) ---------------------------------------------

export type Fonte =
  | { tipo: "lei"; documento: string; artigo: string; trecho?: string | null; ficticio?: boolean }
  | { tipo: "cub"; uf: string; padrao: string; mesReferencia: string; origem: string }
  | {
      tipo: "comparaveis"
      n: number
      raioM: number
      desde: string
      tipologia: string
      ficticio?: boolean
    }
  | { tipo: "dado_terreno"; campo: string; observacao?: string }
  | { tipo: "premissa_usuario"; observacao?: string }
  | { tipo: "default_calibrado"; chave: string; observacao?: string }

// Entrada -------------------------------------------------------------------------

export type TipoRestricao =
  | "app"
  | "area_alagavel"
  | "zona_protecao_ambiental"
  | "faixa_nao_edificavel"
  | "faixa_dominio"
  | "tombamento"
  | "servidao"
  | "outro"

export type Terreno = {
  areaM2: number
  /** Testada principal. Sem ela, o motor estima um lote quadrado (flag de risco). */
  testadaM: number | null
  esquina: boolean
  declividadePct: number | null
  matriculaInformada: boolean
  onusRegistrado: boolean
  /** Restrições físico-ambientais (checklist + interseção com camadas). */
  restricoes: { tipo: TipoRestricao; sobreposicaoM2: number | null; origem: string }[]
  /**
   * Tipos de restrição sem camada oficial no município. Sem camada, a ausência
   * de interseção não prova ausência de restrição: o motor avisa "dados
   * insuficientes" (Blueprint v2.2, p. 7). Opcional em estudos antigos.
   */
  camadasSemCobertura?: TipoRestricao[]
  zona: {
    codigo: string | null
    atribuicao: "automatica" | "manual" | "nenhuma"
    zonasCruzadas: number
  }
}

/** Campos de parâmetro com fonte própria (iguais às colunas de zoning_rules). */
export type CampoRegra =
  | "permitted"
  | "ca_basico"
  | "ca_max"
  | "to_max"
  | "gabarito_m"
  | "gabarito_pavimentos"
  | "recuo_frontal"
  | "recuo_lateral"
  | "recuo_fundos"
  | "lote_minimo_m2"
  | "testada_minima_m"
  | "outorga_fator"

/** Regra urbanística da zona para o uso. Só regras validadas alimentam o motor. */
export type RegraUrbanistica = {
  uso: Uso
  status: "validado" | "ausente"
  permitido: boolean
  caBasico: number | null
  caMaximo: number | null
  toMax: number | null
  gabaritoM: number | null
  gabaritoPavimentos: number | null
  /** Expressões da DSL (src/lib/formula), ex.: "5" ou "max(H / 10, 3)". */
  recuoFrontal: string | null
  recuoLateral: string | null
  recuoFundos: string | null
  loteMinimoM2: number | null
  testadaMinimaM: number | null
  outorgaFator: number | null
  fontes: Partial<Record<CampoRegra, Fonte>>
}

export type EstatisticaComparaveis = {
  n: number
  medianaM2: number
  mediaM2: number
  desvioPadraoM2: number
  /** Coeficiente de variação (desvio ÷ média). */
  cv: number
  minM2: number
  maxM2: number
}

export type Mercado = {
  /** Preço de venda por m² privativo (sugerido pelos comparáveis ou informado). */
  precoVendaM2: number
  fontePreco: Fonte
  comparaveis: EstatisticaComparaveis | null
}

export type FormaAquisicao = "compra" | "permuta_fisica" | "permuta_financeira" | "misto"
export type CurvaObra = "linear" | "s"

/** Premissas editáveis (valores numéricos puros; a fonte de cada uma vai em `fontes`). */
export type Premissas = {
  usarCaMaximo: boolean
  eficiencia: number
  areaNaoComputavelPct: number
  equivalenciaNaoComputavel: number
  peDireitoM: number
  cubM2: number
  fatorCub: number
  precoTerreno: number
  formaAquisicao: FormaAquisicao
  permutaPct: number
  itbiPct: number
  registroPct: number
  projetosPct: number
  marketingPct: number
  corretagemPct: number
  administracaoPct: number
  contingenciaPct: number
  impostosPct: number
  prazoAprovacaoMeses: number
  prazoObraMeses: number
  prazoVendasMeses: number
  vendasNoLancamentoPct: number
  recebimentoSinalPct: number
  recebimentoObraPct: number
  recebimentoChavesPct: number
  curvaObra: CurvaObra
  // Limiares do score de risco
  declividadeAcentuadaPct: number
  nMinimoComparaveis: number
  cvMaximoComparaveis: number
  margemMinimaConservador: number
}

export type ChavePremissa = keyof Premissas

export type DeltasCenario = {
  /** Variação do preço de venda (ex.: -0.1 = 10% menor). */
  preco: number
  /** Variação do custo de construção. */
  custo: number
  /** Variação do prazo de vendas (ex.: 0.5 = vendas 50% mais lentas). */
  prazoVendas: number
}

export type Cenarios = { conservador: DeltasCenario; otimista: DeltasCenario }

export type CodigoFlag =
  | "regra_nao_validada"
  | "uso_nao_permitido"
  | "parametro_ausente"
  | "zona_nao_identificada"
  | "zona_atribuida_manualmente"
  | "lote_multiplas_zonas"
  | "restricao_app"
  | "restricao_alagavel"
  | "restricao_ambiental_outra"
  | "topografia_acentuada"
  | "area_abaixo_minimo"
  | "testada_abaixo_minimo"
  | "testada_estimada"
  | "matricula_ausente"
  | "onus_registrado"
  | "comparaveis_insuficientes"
  | "dispersao_preco_alta"
  | "margem_conservadora_baixa"

export type EixoRisco = "urbanistico" | "fisico" | "juridico" | "mercado"

export type PesoRisco = { eixo: EixoRisco; peso: number; rotulo: string }

export type ConfigRisco = {
  pesos: Record<CodigoFlag, PesoRisco>
  /** Score a partir do qual o risco é Médio / Alto. */
  limiarMedio: number
  limiarAlto: number
}

export type EntradaViabilidade = {
  terreno: Terreno
  regra: RegraUrbanistica
  mercado: Mercado
  premissas: Premissas
  /** Origem de cada premissa. Ausente ⇒ default calibrado. */
  fontes: Partial<Record<ChavePremissa, Fonte>>
  cenarios: Cenarios
  risco: ConfigRisco
}

// Saída ---------------------------------------------------------------------------

export type Limitante = "coeficiente_aproveitamento" | "taxa_ocupacao" | "recuos" | "gabarito"

export type Potencial = {
  testadaM: number
  profundidadeM: number
  testadaEstimada: boolean
  caAplicado: number
  usaOutorga: boolean
  areaComputavelAlvoM2: number
  areaComputavelM2: number
  pavimentos: number
  alturaM: number
  recuosM: { frontal: number; lateral: number; fundos: number }
  projecaoMaxTOM2: number | null
  projecaoRecuosM2: number
  projecaoM2: number
  limitante: Limitante
  /** O que limitou a projeção no pavimento-tipo. */
  projecaoLimitadaPor: "taxa_ocupacao" | "recuos"
  areaAdicionalOutorgaM2: number
  areaNaoComputavelM2: number
  areaConstruidaTotalM2: number
  areaEquivalenteM2: number
  areaPrivativaM2: number
}

export type Custos = {
  terreno: number
  itbiRegistro: number
  construcao: number
  projetos: number
  outorga: number
  marketing: number
  corretagem: number
  administracao: number
  contingencia: number
  impostos: number
  permutaFinanceira: number
  total: number
}

export type MesFluxo = {
  mes: number
  entradas: number
  saidas: number
  saldo: number
  acumulado: number
}

export type Metricas = {
  vgv: number
  receitaIncorporador: number
  custoTotal: number
  lucro: number
  /** Lucro ÷ VGV total (inclui unidades de permuta física). */
  margemVgv: number
  /** Lucro ÷ receita do incorporador. */
  margemReceita: number
  /** Maior necessidade de caixa (módulo do menor acumulado). */
  exposicaoMaxima: number
  /** Lucro ÷ exposição máxima. Null sem exposição. */
  roi: number | null
  tirMensal: number | null
  tirAnual: number | null
  /** Mês em que o acumulado volta a ser ≥ 0. Null se nunca volta. */
  paybackMeses: number | null
  prazoTotalMeses: number
}

export type ResultadoFinanceiro = {
  vgv: number
  receitaIncorporador: number
  custos: Custos
  fluxo: MesFluxo[]
  metricas: Metricas
  prazoVendasMeses: number
}

export type NomeCenario = "conservador" | "base" | "otimista"

export type ResumoCenario = {
  cenario: NomeCenario
  deltas: DeltasCenario
  metricas: Metricas
}

export type FlagRisco = {
  codigo: CodigoFlag
  eixo: EixoRisco
  rotulo: string
  peso: number
  detalhe: string
}

export type NivelRisco = "baixo" | "medio" | "alto"

export type Risco = {
  score: number
  nivel: NivelRisco
  flags: FlagRisco[]
  porEixo: Record<EixoRisco, number>
}

export type PremissaUsada = {
  chave: string
  rotulo: string
  valor: number | string | boolean
  unidade: string
  fonte: Fonte
}

export type StatusResultado = "ok" | "incompleto" | "uso_nao_permitido"

export type ResultadoViabilidade = {
  versaoMotor: string
  uso: Uso
  status: StatusResultado
  pendencias: string[]
  avisos: string[]
  potencial: Potencial | null
  base: ResultadoFinanceiro | null
  cenarios: ResumoCenario[]
  risco: Risco
  premissas: PremissaUsada[]
  disclaimer: string
}

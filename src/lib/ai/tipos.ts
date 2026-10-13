import type { CandidatoRanqueado, Uso } from "@/lib/feasibility"

/**
 * Tipos compartilhados entre servidor e cliente do copiloto: resultados das
 * ferramentas (que viram cartões na tela) e o protocolo de streaming.
 *
 * Os números chegam crus e também formatados em pt-BR (campos *_fmt). O
 * modelo cita os formatados; a avaliação confere que todo número da resposta
 * apareceu em alguma ferramenta.
 */

export type FonteTexto = {
  /** Texto pronto da fonte (lei/artigo, CUB/mês, N comparáveis…). */
  texto: string
  tipo: "lei" | "cub" | "comparaveis" | "dado_terreno" | "premissa_usuario" | "default_calibrado"
  ficticio?: boolean
}

export type TerrenoResumo = {
  id: string
  codigo: string
  endereco: string
  bairro: string | null
  municipio: string
  uf: string
  area_m2: number | null
  area_fmt: string
  preco_pedido: number | null
  preco_fmt: string
  preco_m2_terreno_fmt: string
  negociacao: string | null
  situacao: string
  zona: string | null
  zonas_cruzadas: number
  usos_permitidos: Uso[]
  ficticio: boolean
}

export type TerrenoDetalhe = TerrenoResumo & {
  testada_m: number | null
  esquina: boolean
  topografia: string | null
  declividade_pct: number | null
  matricula_informada: boolean
  onus: string | null
  permuta_pct_fmt: string | null
  zona_atribuicao: "automatica" | "manual" | "nenhuma"
  restricoes: { tipo: string; descricao: string }[]
  observacoes: string | null
}

export type ParametroValidado = {
  campo: string
  rotulo: string
  valor: string
  fonte: FonteTexto | null
  /** Trecho da lei registrado pelo analista ao validar o campo. */
  trecho: string | null
}

export type RegraParametros = {
  uso: Uso
  uso_rotulo: string
  /** Nome do uso na lei municipal, quando difere da categoria da plataforma. */
  uso_na_lei: string | null
  permitido: boolean
  parametros: ParametroValidado[]
  nao_definidos: string[]
  observacoes: string | null
}

export type ResultadoParametros = {
  referencia: string
  /** validado: há regra validada · sem_regra_validada: zona sem regra (para o uso) · sem_zona: ponto/lote sem zona cadastrada. */
  status: "validado" | "sem_regra_validada" | "sem_zona"
  zona: { id: string; codigo: string; nome: string } | null
  regras: RegraParametros[]
  mensagem: string | null
  proximos_passos: string[]
}

export type ResultadoZona = {
  origem: "terreno" | "ponto"
  referencia: string
  municipio: { nome: string; uf: string; cobertura: string } | null
  zona: { id: string; codigo: string; nome: string } | null
  atribuicao: "automatica" | "manual" | "nenhuma"
  zonas_cruzadas: { codigo: string; percentual_fmt: string }[]
  restricoes_ambientais: { tipo: string; nome: string; ficticia: boolean }[]
  mensagem: string | null
}

export type ResultadoMercado = {
  referencia: string
  tipologia: string
  comparaveis: {
    n: number
    mediana_m2_fmt: string
    media_m2_fmt: string
    cv_fmt: string
    faixa_fmt: string
    raio_m: number
    desde_fmt: string
    baixa_confianca: boolean
    ficticios: boolean
  } | null
  cub: { padrao: string; uf: string; valor_fmt: string; mes_fmt: string; origem: string } | null
  avisos: string[]
}

export type MetricasResumo = {
  vgv_fmt: string
  custo_total_fmt: string
  lucro_fmt: string
  margem_fmt: string
  roi_fmt: string
  tir_anual_fmt: string
  payback_fmt: string
  exposicao_fmt: string
}

export type EstudoResumo = {
  uso: Uso
  uso_rotulo: string
  status: "ok" | "incompleto" | "uso_nao_permitido" | "nao_rodou"
  pendencias: string[]
  potencial: {
    area_computavel_fmt: string
    pavimentos: number
    altura_fmt: string
    limitante: string
    area_privativa_fmt: string
    ca_aplicado_fmt: string
    usa_outorga: boolean
  } | null
  base: MetricasResumo | null
  cenarios: { cenario: string; margem_fmt: string; lucro_fmt: string; tir_anual_fmt: string }[]
  risco: { score: number; nivel: string; flags: { rotulo: string; detalhe: string }[] } | null
  premissas_principais: { rotulo: string; valor_fmt: string; fonte: string }[]
  avisos: string[]
  analysis_run_id: string | null
}

export type ResultadoViabilidadeCopiloto = {
  referencia: string
  terreno_id: string | null
  estudos: EstudoResumo[]
  ranking: (Pick<CandidatoRanqueado, "uso" | "elegivel" | "motivo"> & {
    uso_rotulo: string
    tir_anual_fmt: string
    margem_fmt: string
    score_risco: number
    indice_fmt: string
  })[]
  disclaimer: string
}

export type ResultadoComparacao = {
  linhas: {
    codigo: string
    bairro: string | null
    area_fmt: string
    preco_fmt: string
    zona: string | null
    melhor_uso: string | null
    margem_fmt: string
    tir_anual_fmt: string
    risco: string
    observacao: string | null
  }[]
  disclaimer: string
}

export type ResultadoLegislacao = {
  municipio: string
  trechos: { documento: string; artigo: string | null; texto: string; ficticio: boolean }[]
  aviso: string
}

export type ResultadoLocalizacao = {
  consulta: string
  candidatos: {
    descricao: string
    /** "endereço exato", "rua (sem número)", "bairro"… */
    precisao: string
    exato: boolean
    longitude: number
    latitude: number
    zona: string | null
    municipio: string | null
  }[]
  aviso: string | null
}

export type ResultadoCobertura = {
  protocolo: string
  municipio: string
  uf: string
  mensagem: string
}

/** Cartões renderizados na conversa (vêm do resultado das ferramentas, nunca do texto livre). */
export type Cartao =
  | { tipo: "lista_terrenos"; dados: { terrenos: TerrenoResumo[]; filtros: string } }
  | { tipo: "terreno"; dados: TerrenoDetalhe }
  | { tipo: "localizacao"; dados: ResultadoLocalizacao }
  | { tipo: "zona"; dados: ResultadoZona }
  | { tipo: "parametros"; dados: ResultadoParametros }
  | { tipo: "mercado"; dados: ResultadoMercado }
  | { tipo: "viabilidade"; dados: ResultadoViabilidadeCopiloto }
  | { tipo: "comparacao"; dados: ResultadoComparacao }
  | { tipo: "legislacao"; dados: ResultadoLegislacao }
  | { tipo: "cobertura"; dados: ResultadoCobertura }

/** Eventos enviados ao navegador (uma linha JSON por evento). */
export type EventoChat =
  | { t: "conversa"; id: string; titulo: string }
  /** Nova chamada ao modelo dentro do turno. */
  | { t: "passo" }
  | { t: "texto"; delta: string }
  /** Recusa com fallback no servidor: descartar o texto parcial deste passo. */
  | { t: "descartar" }
  | { t: "recusa"; mensagem: string }
  | { t: "progresso"; texto: string }
  | { t: "ferramenta"; id: string; nome: string; rotulo: string; estado: "inicio" | "fim" | "erro" }
  | { t: "cartao"; cartao: Cartao }
  | { t: "foco"; terrenoId: string }
  | { t: "fim" }
  | { t: "erro"; mensagem: string }

/** Item de conversa já pronto para a tela (histórico carregado do banco). */
export type ItemConversa =
  | { tipo: "usuario"; id: string; texto: string; anexos: string[] }
  | { tipo: "assistente"; id: string; texto: string }
  | { tipo: "progresso"; id: string; texto: string }
  | { tipo: "cartao"; id: string; cartao: Cartao }

import type {
  Cenarios,
  ChavePremissa,
  CodigoFlag,
  ConfigRisco,
  PesoRisco,
  Premissas,
} from "./types"

/**
 * Defaults do motor. São os valores usados quando nem o usuário nem a tabela
 * feasibility_defaults informam a premissa.
 *
 * TODO(cliente): pendência 1 do PRD. Valores usuais de mercado, a calibrar com
 * o Gabriel e os engenheiros parceiros. Mantenha em sincronia com o seed de
 * public.feasibility_defaults (supabase/migrations/*_feasibility_seed.sql).
 */
export const PREMISSAS_PADRAO = {
  usarCaMaximo: false,
  eficiencia: 0.8,
  areaNaoComputavelPct: 0.4,
  equivalenciaNaoComputavel: 0.5,
  peDireitoM: 3,
  fatorCub: 1.3,
  formaAquisicao: "compra",
  permutaPct: 0,
  itbiPct: 0.03,
  registroPct: 0.01,
  projetosPct: 0.04,
  marketingPct: 0.03,
  corretagemPct: 0.05,
  administracaoPct: 0.03,
  contingenciaPct: 0.05,
  impostosPct: 0.04,
  prazoAprovacaoMeses: 6,
  prazoObraMeses: 30,
  prazoVendasMeses: 24,
  vendasNoLancamentoPct: 0.3,
  recebimentoSinalPct: 0.1,
  recebimentoObraPct: 0.2,
  recebimentoChavesPct: 0.7,
  curvaObra: "s",
  declividadeAcentuadaPct: 15,
  nMinimoComparaveis: 5,
  cvMaximoComparaveis: 0.2,
  margemMinimaConservador: 0.12,
} as const satisfies Omit<Premissas, "cubM2" | "precoTerreno">

/** TODO(cliente): deltas dos cenários, a calibrar. */
export const CENARIOS_PADRAO: Cenarios = {
  conservador: { preco: -0.1, custo: 0.1, prazoVendas: 0.5 },
  otimista: { preco: 0.05, custo: -0.05, prazoVendas: -0.25 },
}

const peso = (eixo: PesoRisco["eixo"], valor: number, rotulo: string): PesoRisco => ({
  eixo,
  peso: valor,
  rotulo,
})

/** TODO(cliente): pesos do score de risco (ADR 0008), a calibrar. */
export const PESOS_RISCO_PADRAO: Record<CodigoFlag, PesoRisco> = {
  regra_nao_validada: peso("urbanistico", 30, "Sem regra urbanística validada para o uso"),
  uso_nao_permitido: peso("urbanistico", 40, "Uso não permitido na zona"),
  parametro_ausente: peso("urbanistico", 15, "Parâmetro urbanístico não validado"),
  zona_nao_identificada: peso("urbanistico", 25, "Zona não identificada"),
  zona_atribuida_manualmente: peso("urbanistico", 10, "Zona atribuída manualmente"),
  lote_multiplas_zonas: peso("urbanistico", 10, "Lote em mais de uma zona"),
  restricao_app: peso("fisico", 25, "Interseção com APP"),
  restricao_alagavel: peso("fisico", 25, "Área alagável"),
  restricao_ambiental_outra: peso("fisico", 15, "Outra restrição físico-ambiental"),
  topografia_acentuada: peso("fisico", 10, "Topografia acentuada"),
  area_abaixo_minimo: peso("fisico", 20, "Área abaixo do lote mínimo"),
  testada_abaixo_minimo: peso("fisico", 15, "Testada abaixo da mínima"),
  testada_estimada: peso("fisico", 5, "Testada não informada (geometria estimada)"),
  matricula_ausente: peso("juridico", 20, "Matrícula não informada"),
  onus_registrado: peso("juridico", 15, "Ônus registrado"),
  comparaveis_insuficientes: peso("mercado", 15, "Poucos comparáveis de mercado"),
  dispersao_preco_alta: peso("mercado", 10, "Alta dispersão de preços"),
  margem_conservadora_baixa: peso("mercado", 20, "Margem baixa no cenário conservador"),
}

export const RISCO_PADRAO: ConfigRisco = {
  pesos: PESOS_RISCO_PADRAO,
  limiarMedio: 25,
  limiarAlto: 50,
}

/** Rótulo e unidade de cada premissa, para exibição e para o relatório. */
export const ROTULOS_PREMISSAS: Record<ChavePremissa, { rotulo: string; unidade: string }> = {
  usarCaMaximo: { rotulo: "Usar CA máximo (com outorga onerosa)", unidade: "" },
  eficiencia: { rotulo: "Eficiência (privativa ÷ computável)", unidade: "%" },
  areaNaoComputavelPct: { rotulo: "Área não computável (sobre a computável)", unidade: "%" },
  equivalenciaNaoComputavel: {
    rotulo: "Equivalência de custo da área não computável",
    unidade: "",
  },
  peDireitoM: { rotulo: "Pé-direito por pavimento", unidade: "m" },
  cubM2: { rotulo: "CUB", unidade: "R$/m²" },
  fatorCub: { rotulo: "Fator sobre o CUB (fundações, elevadores, BDI)", unidade: "" },
  precoTerreno: { rotulo: "Preço do terreno", unidade: "R$" },
  formaAquisicao: { rotulo: "Forma de aquisição", unidade: "" },
  permutaPct: { rotulo: "Permuta", unidade: "%" },
  itbiPct: { rotulo: "ITBI", unidade: "%" },
  registroPct: { rotulo: "Registro e escritura", unidade: "%" },
  projetosPct: { rotulo: "Projetos e aprovações (sobre a obra)", unidade: "%" },
  marketingPct: { rotulo: "Marketing e stand (sobre o VGV)", unidade: "%" },
  corretagemPct: { rotulo: "Corretagem (sobre o VGV)", unidade: "%" },
  administracaoPct: { rotulo: "Administração (sobre a obra)", unidade: "%" },
  contingenciaPct: { rotulo: "Contingência (sobre a obra)", unidade: "%" },
  impostosPct: { rotulo: "Impostos (RET, sobre a receita)", unidade: "%" },
  prazoAprovacaoMeses: { rotulo: "Prazo de aprovação", unidade: "meses" },
  prazoObraMeses: { rotulo: "Prazo de obra", unidade: "meses" },
  prazoVendasMeses: { rotulo: "Prazo de vendas", unidade: "meses" },
  vendasNoLancamentoPct: { rotulo: "Vendas no lançamento", unidade: "%" },
  recebimentoSinalPct: { rotulo: "Recebimento: sinal", unidade: "%" },
  recebimentoObraPct: { rotulo: "Recebimento: mensais durante a obra", unidade: "%" },
  recebimentoChavesPct: { rotulo: "Recebimento: chaves/repasse", unidade: "%" },
  curvaObra: { rotulo: "Curva de desembolso da obra", unidade: "" },
  declividadeAcentuadaPct: { rotulo: "Limiar de topografia acentuada", unidade: "%" },
  nMinimoComparaveis: { rotulo: "Mínimo de comparáveis", unidade: "" },
  cvMaximoComparaveis: { rotulo: "Dispersão máxima dos comparáveis", unidade: "%" },
  margemMinimaConservador: { rotulo: "Margem mínima no cenário conservador", unidade: "%" },
}

export const DISCLAIMER =
  "Estudo preliminar automatizado. Não substitui análise técnica, jurídica e de due diligence por profissional habilitado."

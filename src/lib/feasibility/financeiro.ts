import { anualizar, exposicaoMaxima, payback, tir } from "./metricas"
import type {
  Custos,
  CurvaObra,
  DeltasCenario,
  MesFluxo,
  Metricas,
  Potencial,
  Premissas,
  ResultadoFinanceiro,
} from "./types"

/**
 * Etapas B (receita), C (custos) e D (fluxo de caixa e métricas). ADR 0007.
 *
 * Linha do tempo (meses):
 *   0                      compra do terreno (preço + ITBI/registro)
 *   1 … A                  aprovação (projetos); outorga paga no mês A
 *   A+1 … A+O              obra (curva linear ou S)
 *   A+1 … A+V              vendas (lançamento em A+1)
 *   A+O+1                  chaves / repasse
 * Cada coorte de vendas paga sinal no mês da venda, as mensais nos meses de obra
 * restantes e o saldo nas chaves (ou tudo no mês da venda, se vendida pronta).
 */
export type EntradaFinanceira = {
  potencial: Potencial
  areaTerrenoM2: number
  precoVendaM2: number
  outorgaFator: number | null
  premissas: Premissas
  deltas: DeltasCenario
}

export type SaidaFinanceira = { resultado: ResultadoFinanceiro; avisos: string[] }

export function calcularFinanceiro(entrada: EntradaFinanceira): SaidaFinanceira {
  const { potencial, premissas: p, deltas } = entrada
  const avisos: string[] = []

  // B. Receita
  const precoVenda = entrada.precoVendaM2 * (1 + deltas.preco)
  const vgv = potencial.areaPrivativaM2 * precoVenda
  const permutaFisica =
    p.formaAquisicao === "permuta_fisica" || p.formaAquisicao === "misto" ? p.permutaPct : 0
  const permutaFinanceiraPct = p.formaAquisicao === "permuta_financeira" ? p.permutaPct : 0
  const receita = vgv * (1 - permutaFisica)

  // C. Custos
  const precoTerreno =
    p.formaAquisicao === "compra" || p.formaAquisicao === "misto" ? p.precoTerreno : 0
  // Base do ITBI e do valor do terreno: dinheiro + valor da permuta.
  const valorAquisicao = precoTerreno + vgv * permutaFisica + receita * permutaFinanceiraPct
  const construcao = potencial.areaEquivalenteM2 * p.cubM2 * p.fatorCub * (1 + deltas.custo)

  let outorga = 0
  if (potencial.areaAdicionalOutorgaM2 > 0) {
    if (entrada.outorgaFator === null) {
      avisos.push("Fator de outorga onerosa não validado: custo da outorga não calculado.")
    } else {
      const valorTerrenoM2 = valorAquisicao / entrada.areaTerrenoM2
      outorga = potencial.areaAdicionalOutorgaM2 * valorTerrenoM2 * entrada.outorgaFator
    }
  }

  const custosSemTotal = {
    terreno: precoTerreno,
    itbiRegistro: valorAquisicao * (p.itbiPct + p.registroPct),
    construcao,
    projetos: construcao * p.projetosPct,
    outorga,
    marketing: receita * p.marketingPct,
    corretagem: receita * p.corretagemPct,
    administracao: construcao * p.administracaoPct,
    contingencia: construcao * p.contingenciaPct,
    impostos: receita * p.impostosPct,
    permutaFinanceira: receita * permutaFinanceiraPct,
  }
  const custos: Custos = {
    ...custosSemTotal,
    total: Object.values(custosSemTotal).reduce((a, b) => a + b, 0),
  }

  // D. Fluxo de caixa
  const aprovacao = Math.max(0, Math.round(p.prazoAprovacaoMeses))
  const obra = Math.max(1, Math.round(p.prazoObraMeses))
  const prazoVendas = Math.max(1, Math.round(p.prazoVendasMeses * (1 + deltas.prazoVendas)))
  const lancamento = aprovacao + 1
  const fimObra = aprovacao + obra
  const chaves = fimObra + 1
  const ultimoMes = Math.max(chaves, aprovacao + prazoVendas)

  const entradas = new Array<number>(ultimoMes + 1).fill(0)
  const saidas = new Array<number>(ultimoMes + 1).fill(0)

  const vendas = curvaVendas(prazoVendas, p.vendasNoLancamentoPct)
  const recebimentos = new Array<number>(ultimoMes + 1).fill(0)
  vendas.forEach((fracao, i) => {
    const mes = lancamento + i
    recebimentos[mes]! += fracao * p.recebimentoSinalPct
    const mesesObra = Math.max(0, fimObra - mes)
    if (mesesObra > 0) {
      for (let k = mes + 1; k <= fimObra; k++) {
        recebimentos[k]! += (fracao * p.recebimentoObraPct) / mesesObra
      }
    } else {
      recebimentos[Math.max(chaves, mes)]! += fracao * p.recebimentoObraPct
    }
    recebimentos[Math.max(chaves, mes)]! += fracao * p.recebimentoChavesPct
  })

  for (let t = 0; t <= ultimoMes; t++) entradas[t] = recebimentos[t]! * receita

  saidas[0]! += custos.terreno + custos.itbiRegistro
  if (aprovacao > 0) {
    for (let t = 1; t <= aprovacao; t++) saidas[t]! += custos.projetos / aprovacao
  } else {
    saidas[0]! += custos.projetos
  }
  saidas[aprovacao]! += custos.outorga

  const pesosObra = curvaDesembolso(obra, p.curvaObra)
  const custoObra = custos.construcao + custos.administracao + custos.contingencia
  pesosObra.forEach((peso, i) => {
    saidas[lancamento + i]! += custoObra * peso
  })

  vendas.forEach((fracao, i) => {
    saidas[lancamento + i]! += (custos.marketing + custos.corretagem) * fracao
  })
  for (let t = 0; t <= ultimoMes; t++) {
    saidas[t]! += recebimentos[t]! * (custos.impostos + custos.permutaFinanceira)
  }

  const fluxo: MesFluxo[] = []
  let acumulado = 0
  for (let t = 0; t <= ultimoMes; t++) {
    const saldo = entradas[t]! - saidas[t]!
    acumulado += saldo
    fluxo.push({ mes: t, entradas: entradas[t]!, saidas: saidas[t]!, saldo, acumulado })
  }

  const metricas = calcularMetricas(vgv, receita, custos.total, fluxo)
  return {
    resultado: {
      vgv,
      receitaIncorporador: receita,
      custos,
      fluxo,
      metricas,
      prazoVendasMeses: prazoVendas,
    },
    avisos,
  }
}

function calcularMetricas(
  vgv: number,
  receita: number,
  custoTotal: number,
  fluxo: MesFluxo[],
): Metricas {
  const lucro = fluxo.reduce((s, m) => s + m.saldo, 0)
  const acumulados = fluxo.map((m) => m.acumulado)
  const exposicao = exposicaoMaxima(acumulados)
  const tirMensal = tir(fluxo.map((m) => m.saldo))
  return {
    vgv,
    receitaIncorporador: receita,
    custoTotal,
    lucro,
    margemVgv: vgv > 0 ? lucro / vgv : 0,
    margemReceita: receita > 0 ? lucro / receita : 0,
    exposicaoMaxima: exposicao,
    roi: exposicao > 0 ? lucro / exposicao : null,
    tirMensal,
    tirAnual: anualizar(tirMensal),
    paybackMeses: payback(acumulados),
    prazoTotalMeses: fluxo.length - 1,
  }
}

/** Fração vendida em cada mês: parte no lançamento, o resto linear. Soma 1. */
export function curvaVendas(meses: number, noLancamento: number): number[] {
  const l = Math.min(1, Math.max(0, noLancamento))
  const resto = (1 - l) / meses
  return Array.from({ length: meses }, (_, i) => (i === 0 ? l + resto : resto))
}

/** Pesos mensais de desembolso da obra. "s": sino (mais no meio). Soma 1. */
export function curvaDesembolso(meses: number, curva: CurvaObra): number[] {
  if (curva === "linear") return Array.from({ length: meses }, () => 1 / meses)
  const brutos = Array.from({ length: meses }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / meses))
  const soma = brutos.reduce((a, b) => a + b, 0)
  return brutos.map((b) => b / soma)
}

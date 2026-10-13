import { CENARIOS_PADRAO, PREMISSAS_PADRAO, RISCO_PADRAO } from "./defaults"
import type { EntradaViabilidade, Premissas, RegraUrbanistica, Terreno } from "./types"

/**
 * Caso de conferência 01 (docs/validacao/caso-01.md): lote de 2.000 m² na
 * ZT-2 (fictícia), residencial vertical, compra à vista, premissas padrão.
 */
export function regraZT2(over: Partial<RegraUrbanistica> = {}): RegraUrbanistica {
  return {
    uso: "residencial_vertical",
    status: "validado",
    permitido: true,
    caBasico: 1.5,
    caMaximo: 2.5,
    toMax: 0.6,
    gabaritoM: 48,
    gabaritoPavimentos: 16,
    recuoFrontal: "5",
    recuoLateral: "max(H / 12, 2.5)",
    recuoFundos: "max(H / 12, 2.5)",
    loteMinimoM2: 360,
    testadaMinimaM: 12,
    outorgaFator: 0.3,
    fontes: {
      ca_basico: {
        tipo: "lei",
        documento: "Lei Complementar nº 999/2026-TESTE",
        artigo: "Anexo II, Tabela ZT-2 (fictício)",
        ficticio: true,
      },
    },
    ...over,
  }
}

export function terrenoCaso01(over: Partial<Terreno> = {}): Terreno {
  return {
    areaM2: 2000,
    testadaM: 40,
    esquina: false,
    declividadePct: null,
    matriculaInformada: true,
    onusRegistrado: false,
    restricoes: [],
    zona: { codigo: "ZT-2", atribuicao: "automatica", zonasCruzadas: 1 },
    ...over,
  }
}

export function premissasCaso01(over: Partial<Premissas> = {}): Premissas {
  return { ...PREMISSAS_PADRAO, cubM2: 2458.13, precoTerreno: 5_500_000, ...over }
}

export function entradaCaso01(
  over: {
    terreno?: Partial<Terreno>
    regra?: Partial<RegraUrbanistica>
    premissas?: Partial<Premissas>
    precoVendaM2?: number
    comparaveis?: EntradaViabilidade["mercado"]["comparaveis"]
  } = {},
): EntradaViabilidade {
  return {
    terreno: terrenoCaso01(over.terreno),
    regra: regraZT2(over.regra),
    mercado: {
      precoVendaM2: over.precoVendaM2 ?? 11_000,
      fontePreco: {
        tipo: "comparaveis",
        n: 10,
        raioM: 1500,
        desde: "2024-08-01",
        tipologia: "apartamento",
      },
      comparaveis:
        over.comparaveis === undefined
          ? {
              n: 10,
              medianaM2: 11_000,
              mediaM2: 11_050,
              desvioPadraoM2: 880,
              cv: 0.0796,
              minM2: 9_800,
              maxM2: 12_400,
            }
          : over.comparaveis,
    },
    premissas: premissasCaso01(over.premissas),
    fontes: {
      cubM2: {
        tipo: "cub",
        uf: "CE",
        padrao: "R8-N",
        mesReferencia: "2026-08",
        origem: "Sinduscon-CE",
      },
      precoTerreno: { tipo: "dado_terreno", campo: "preco_pedido" },
    },
    cenarios: CENARIOS_PADRAO,
    risco: RISCO_PADRAO,
  }
}

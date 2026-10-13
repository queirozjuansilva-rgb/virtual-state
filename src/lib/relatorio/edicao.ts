import {
  premissasSchema,
  ROTULOS_PREMISSAS,
  type ChavePremissa,
  type EntradaViabilidade,
  type Fonte,
} from "@/lib/feasibility"

/**
 * Variáveis editáveis do relatório (PRD, Módulo 6). Ao editar, a premissa
 * passa a ter a fonte "premissa do usuário"; o cálculo continua no motor.
 * Limiares de risco (declividade, N e dispersão dos comparáveis, margem
 * mínima) são metodologia, não premissa do estudo: não entram aqui.
 */

export type ChaveEditavel =
  | Exclude<
      ChavePremissa,
      | "declividadeAcentuadaPct"
      | "nMinimoComparaveis"
      | "cvMaximoComparaveis"
      | "margemMinimaConservador"
    >
  | "precoVendaM2"

export type TipoCampo =
  "moeda" | "moeda_m2" | "percentual" | "numero" | "meses" | "booleano" | "opcao"

export type CampoEditavel = {
  chave: ChaveEditavel
  rotulo: string
  tipo: TipoCampo
  grupo: "principal" | "avancado"
  opcoes?: readonly (readonly [string, string])[]
  ajuda?: string
}

const rotulo = (chave: ChavePremissa) => ROTULOS_PREMISSAS[chave].rotulo

export const CAMPOS_EDITAVEIS: readonly CampoEditavel[] = [
  {
    chave: "precoVendaM2",
    rotulo: "Preço de venda (privativo)",
    tipo: "moeda_m2",
    grupo: "principal",
    ajuda: "Sugerido pela mediana dos comparáveis.",
  },
  { chave: "precoTerreno", rotulo: rotulo("precoTerreno"), tipo: "moeda", grupo: "principal" },
  {
    chave: "formaAquisicao",
    rotulo: rotulo("formaAquisicao"),
    tipo: "opcao",
    grupo: "principal",
    opcoes: [
      ["compra", "Compra"],
      ["permuta_fisica", "Permuta física"],
      ["permuta_financeira", "Permuta financeira"],
      ["misto", "Misto (dinheiro + permuta)"],
    ],
  },
  { chave: "permutaPct", rotulo: rotulo("permutaPct"), tipo: "percentual", grupo: "principal" },
  {
    chave: "cubM2",
    rotulo: "Custo de construção (CUB)",
    tipo: "moeda_m2",
    grupo: "principal",
    ajuda: "CUB mais recente da UF; troque pelo seu custo, se tiver.",
  },
  { chave: "fatorCub", rotulo: rotulo("fatorCub"), tipo: "numero", grupo: "principal" },
  { chave: "eficiencia", rotulo: rotulo("eficiencia"), tipo: "percentual", grupo: "principal" },
  { chave: "usarCaMaximo", rotulo: rotulo("usarCaMaximo"), tipo: "booleano", grupo: "principal" },
  { chave: "prazoObraMeses", rotulo: rotulo("prazoObraMeses"), tipo: "meses", grupo: "principal" },
  {
    chave: "prazoVendasMeses",
    rotulo: rotulo("prazoVendasMeses"),
    tipo: "meses",
    grupo: "principal",
  },
  { chave: "impostosPct", rotulo: rotulo("impostosPct"), tipo: "percentual", grupo: "principal" },
  {
    chave: "corretagemPct",
    rotulo: rotulo("corretagemPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  { chave: "marketingPct", rotulo: rotulo("marketingPct"), tipo: "percentual", grupo: "avancado" },
  { chave: "projetosPct", rotulo: rotulo("projetosPct"), tipo: "percentual", grupo: "avancado" },
  {
    chave: "administracaoPct",
    rotulo: rotulo("administracaoPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  {
    chave: "contingenciaPct",
    rotulo: rotulo("contingenciaPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  { chave: "itbiPct", rotulo: rotulo("itbiPct"), tipo: "percentual", grupo: "avancado" },
  { chave: "registroPct", rotulo: rotulo("registroPct"), tipo: "percentual", grupo: "avancado" },
  {
    chave: "areaNaoComputavelPct",
    rotulo: rotulo("areaNaoComputavelPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  {
    chave: "equivalenciaNaoComputavel",
    rotulo: rotulo("equivalenciaNaoComputavel"),
    tipo: "numero",
    grupo: "avancado",
  },
  { chave: "peDireitoM", rotulo: `${rotulo("peDireitoM")} (m)`, tipo: "numero", grupo: "avancado" },
  {
    chave: "prazoAprovacaoMeses",
    rotulo: rotulo("prazoAprovacaoMeses"),
    tipo: "meses",
    grupo: "avancado",
  },
  {
    chave: "vendasNoLancamentoPct",
    rotulo: rotulo("vendasNoLancamentoPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  {
    chave: "recebimentoSinalPct",
    rotulo: rotulo("recebimentoSinalPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  {
    chave: "recebimentoObraPct",
    rotulo: rotulo("recebimentoObraPct"),
    tipo: "percentual",
    grupo: "avancado",
  },
  {
    chave: "recebimentoChavesPct",
    rotulo: rotulo("recebimentoChavesPct"),
    tipo: "percentual",
    grupo: "avancado",
    ajuda: "Sinal + mensais + chaves devem somar 100%.",
  },
  {
    chave: "curvaObra",
    rotulo: rotulo("curvaObra"),
    tipo: "opcao",
    grupo: "avancado",
    opcoes: [
      ["s", "Curva S"],
      ["linear", "Linear"],
    ],
  },
]

const CHAVES = new Set<string>(CAMPOS_EDITAVEIS.map((c) => c.chave))

export type ValorCampo = number | string | boolean
export type Edicoes = Partial<Record<ChaveEditavel, ValorCampo>>

/** Valores atuais (da entrada) de cada campo editável. */
export function valoresDaEntrada(entrada: EntradaViabilidade): Record<ChaveEditavel, ValorCampo> {
  const valores = {} as Record<ChaveEditavel, ValorCampo>
  for (const c of CAMPOS_EDITAVEIS) {
    valores[c.chave] =
      c.chave === "precoVendaM2"
        ? entrada.mercado.precoVendaM2
        : entrada.premissas[c.chave as keyof EntradaViabilidade["premissas"]]
  }
  return valores
}

/** Igualdade com tolerância para números (o formulário arredonda a 6 casas). */
export function mesmoValor(a: ValorCampo, b: ValorCampo): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
  }
  return a === b
}

export const FONTE_AJUSTE: Fonte = { tipo: "premissa_usuario", observacao: "Ajustado no relatório" }

export type ErrosEdicao = Partial<Record<ChaveEditavel | "geral", string>>

export type ResultadoEdicao =
  | { ok: true; entrada: EntradaViabilidade; alteradas: ChaveEditavel[] }
  | { ok: false; erros: ErrosEdicao }

function tipoCompativel(campo: CampoEditavel, valor: ValorCampo): boolean {
  if (campo.tipo === "booleano") return typeof valor === "boolean"
  if (campo.tipo === "opcao")
    return typeof valor === "string" && campo.opcoes!.some(([v]) => v === valor)
  return typeof valor === "number" && Number.isFinite(valor)
}

/**
 * Aplica as edições numa cópia da entrada. Valida tipos e as regras das
 * premissas (premissasSchema). Só as que mudaram de valor ganham a fonte de
 * ajuste do usuário; as demais mantêm a fonte original.
 */
export function aplicarEdicoes(entrada: EntradaViabilidade, edicoes: Edicoes): ResultadoEdicao {
  const erros: ErrosEdicao = {}
  const atuais = valoresDaEntrada(entrada)
  const alteradas: ChaveEditavel[] = []

  for (const [chave, valor] of Object.entries(edicoes) as [ChaveEditavel, ValorCampo][]) {
    const campo = CAMPOS_EDITAVEIS.find((c) => c.chave === chave)
    if (!campo || !CHAVES.has(chave)) {
      erros[chave] = "Campo não editável."
      continue
    }
    if (!tipoCompativel(campo, valor)) {
      erros[chave] = "Valor inválido."
      continue
    }
    if (!mesmoValor(valor, atuais[chave])) alteradas.push(chave)
  }
  if (typeof edicoes.precoVendaM2 === "number" && !(edicoes.precoVendaM2 > 0)) {
    erros.precoVendaM2 = "O preço de venda deve ser maior que zero."
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros }

  const nova: EntradaViabilidade = structuredClone(entrada)
  for (const chave of alteradas) {
    const valor = edicoes[chave]!
    if (chave === "precoVendaM2") {
      nova.mercado.precoVendaM2 = valor as number
      nova.mercado.fontePreco = FONTE_AJUSTE
    } else {
      ;(nova.premissas as Record<string, ValorCampo>)[chave] = valor
      nova.fontes[chave] = FONTE_AJUSTE
    }
  }

  const validacao = premissasSchema.safeParse(nova.premissas)
  if (!validacao.success) {
    for (const issue of validacao.error.issues) {
      const chave = String(issue.path[0]) as ChaveEditavel
      erros[CHAVES.has(chave) ? chave : "geral"] ??= issue.message
    }
    return { ok: false, erros }
  }
  return { ok: true, entrada: nova, alteradas }
}

export type Alteracao = { chave: ChaveEditavel; rotulo: string; de: ValorCampo; para: ValorCampo }

/** O que mudou nas variáveis editáveis entre duas entradas (histórico de versões). */
export function alteracoesEntre(
  antes: EntradaViabilidade,
  depois: EntradaViabilidade,
): Alteracao[] {
  const a = valoresDaEntrada(antes)
  const d = valoresDaEntrada(depois)
  return CAMPOS_EDITAVEIS.filter((c) => !mesmoValor(a[c.chave], d[c.chave])).map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo,
    de: a[c.chave],
    para: d[c.chave],
  }))
}

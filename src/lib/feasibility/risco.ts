import type {
  CodigoFlag,
  ConfigRisco,
  EixoRisco,
  FlagRisco,
  Mercado,
  NivelRisco,
  Potencial,
  Premissas,
  RegraUrbanistica,
  Risco,
  Terreno,
} from "./types"

/**
 * Etapa F: score de risco (ADR 0008). Soma ponderada de flags explícitas,
 * limitada a 100. O resultado sempre lista as flags que dispararam: o nível
 * ("Baixo/Médio/Alto") nunca aparece sozinho.
 */
export type EntradaRisco = {
  terreno: Terreno
  regra: RegraUrbanistica
  mercado: Mercado
  premissas: Pick<
    Premissas,
    | "declividadeAcentuadaPct"
    | "nMinimoComparaveis"
    | "cvMaximoComparaveis"
    | "margemMinimaConservador"
  >
  potencial: Potencial | null
  /** Margem sobre o VGV no cenário conservador (null se não calculada). */
  margemConservador: number | null
}

const formatarPct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`

export function avaliarRisco(entrada: EntradaRisco, config: ConfigRisco): Risco {
  const { terreno, regra, mercado, premissas: p, potencial } = entrada
  const disparadas: { codigo: CodigoFlag; detalhe: string }[] = []
  const flag = (codigo: CodigoFlag, detalhe: string) => disparadas.push({ codigo, detalhe })

  // Urbanístico
  if (regra.status === "ausente") {
    flag("regra_nao_validada", "Não há regra validada para este uso na zona do lote.")
  } else if (!regra.permitido) {
    flag("uso_nao_permitido", "A regra validada da zona não permite este uso.")
  } else {
    const ausentes: string[] = []
    if (regra.caBasico === null) ausentes.push("CA básico")
    if (regra.toMax === null) ausentes.push("taxa de ocupação")
    if (regra.gabaritoM === null && regra.gabaritoPavimentos === null) ausentes.push("gabarito")
    if (regra.recuoFrontal === null) ausentes.push("recuo frontal")
    if (regra.recuoLateral === null) ausentes.push("recuo lateral")
    if (regra.recuoFundos === null) ausentes.push("recuo de fundos")
    if (potencial?.usaOutorga && regra.outorgaFator === null) ausentes.push("fator de outorga")
    if (ausentes.length > 0)
      flag("parametro_ausente", `Sem valor validado: ${ausentes.join(", ")}.`)
  }

  if (terreno.zona.atribuicao === "nenhuma") {
    flag("zona_nao_identificada", "Nenhuma zona cadastrada cruza o lote.")
  } else if (terreno.zona.atribuicao === "manual") {
    flag("zona_atribuida_manualmente", `Zona ${terreno.zona.codigo ?? ""} atribuída à mão.`.trim())
  }
  if (terreno.zona.zonasCruzadas > 1) {
    flag("lote_multiplas_zonas", `O lote cruza ${terreno.zona.zonasCruzadas} zonas.`)
  }

  // Físico
  const descreverRestricao = (r: Terreno["restricoes"][number]) =>
    r.sobreposicaoM2 !== null
      ? `${r.origem} (${Math.round(r.sobreposicaoM2).toLocaleString("pt-BR")} m²)`
      : r.origem
  const app = terreno.restricoes.filter((r) => r.tipo === "app")
  const alagavel = terreno.restricoes.filter((r) => r.tipo === "area_alagavel")
  const outras = terreno.restricoes.filter((r) => r.tipo !== "app" && r.tipo !== "area_alagavel")
  if (app.length > 0) flag("restricao_app", app.map(descreverRestricao).join("; "))
  if (alagavel.length > 0) flag("restricao_alagavel", alagavel.map(descreverRestricao).join("; "))
  if (outras.length > 0)
    flag("restricao_ambiental_outra", outras.map(descreverRestricao).join("; "))

  if (terreno.declividadePct !== null && terreno.declividadePct >= p.declividadeAcentuadaPct) {
    flag(
      "topografia_acentuada",
      `Declividade de ${terreno.declividadePct}% (limiar ${p.declividadeAcentuadaPct}%).`,
    )
  }
  if (regra.loteMinimoM2 !== null && terreno.areaM2 < regra.loteMinimoM2) {
    flag(
      "area_abaixo_minimo",
      `Área de ${Math.round(terreno.areaM2)} m² abaixo do lote mínimo de ${regra.loteMinimoM2} m².`,
    )
  }
  if (terreno.testadaM === null) {
    flag("testada_estimada", "Sem testada informada; geometria do lote estimada.")
  } else if (regra.testadaMinimaM !== null && terreno.testadaM < regra.testadaMinimaM) {
    flag(
      "testada_abaixo_minimo",
      `Testada de ${terreno.testadaM} m abaixo da mínima de ${regra.testadaMinimaM} m.`,
    )
  }

  // Jurídico
  if (!terreno.matriculaInformada) flag("matricula_ausente", "Nº da matrícula não informado.")
  if (terreno.onusRegistrado) flag("onus_registrado", "Há ônus registrado na matrícula.")

  // Mercado
  const comp = mercado.comparaveis
  if (comp === null || comp.n < p.nMinimoComparaveis) {
    flag(
      "comparaveis_insuficientes",
      `${comp?.n ?? 0} comparáveis (mínimo ${p.nMinimoComparaveis}). Preço de venda com baixa confiança.`,
    )
  }
  if (comp !== null && comp.n > 1 && comp.cv > p.cvMaximoComparaveis) {
    flag(
      "dispersao_preco_alta",
      `Coeficiente de variação de ${formatarPct(comp.cv)} (máximo ${formatarPct(p.cvMaximoComparaveis)}).`,
    )
  }
  if (entrada.margemConservador !== null && entrada.margemConservador < p.margemMinimaConservador) {
    flag(
      "margem_conservadora_baixa",
      `Margem de ${formatarPct(entrada.margemConservador)} no cenário conservador (mínimo ${formatarPct(p.margemMinimaConservador)}).`,
    )
  }

  const flags: FlagRisco[] = disparadas.map(({ codigo, detalhe }) => {
    const { eixo, peso, rotulo } = config.pesos[codigo]
    return { codigo, eixo, rotulo, peso, detalhe }
  })
  const porEixo: Record<EixoRisco, number> = { urbanistico: 0, fisico: 0, juridico: 0, mercado: 0 }
  for (const f of flags) porEixo[f.eixo] += f.peso
  const score = Math.min(
    100,
    flags.reduce((s, f) => s + f.peso, 0),
  )

  return { score, nivel: nivelRisco(score, config), flags, porEixo }
}

export function nivelRisco(
  score: number,
  config: Pick<ConfigRisco, "limiarMedio" | "limiarAlto">,
): NivelRisco {
  if (score >= config.limiarAlto) return "alto"
  if (score >= config.limiarMedio) return "medio"
  return "baixo"
}

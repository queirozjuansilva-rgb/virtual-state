import { z } from "zod"

import {
  calcularViabilidade,
  DISCLAIMER,
  ranquearUsos,
  type ResultadoViabilidade,
  type Uso,
} from "@/lib/feasibility"
import { montarEntrada, type ContextoTerreno } from "@/server/feasibility/montar-entrada"

import type { DadosCopiloto } from "../dados"
import type { EstudoResumo, ResultadoComparacao, ResultadoViabilidadeCopiloto } from "../tipos"
import {
  ErroFerramenta,
  ferramenta,
  resolverTerreno,
  USOS,
  zLatitude,
  zLongitude,
  zRefTerreno,
  zUso,
} from "./ferramenta"
import { resumoEstudo, resumoRanking, resumoTerreno } from "./resumos"

/**
 * Ferramentas que rodam o motor de viabilidade (src/lib/feasibility). O modelo
 * nunca calcula: ele escolhe a ferramenta e os parâmetros; os números vêm daqui.
 */

const zPrecoVenda = z
  .number()
  .positive()
  .max(1_000_000)
  .describe(
    "Preço de venda por m² privativo, em R$, SOMENTE se o usuário informou. Sem ele, o motor usa a mediana dos comparáveis.",
  )

const zCaMaximo = z
  .boolean()
  .describe("true para simular o CA máximo (com outorga onerosa), se o usuário pediu.")

type OpcoesCopiloto = { uso?: Uso; precoVendaM2?: number; usarCaMaximo?: boolean }

async function estudar(
  dados: DadosCopiloto,
  ctx: ContextoTerreno,
  opcoes: OpcoesCopiloto,
  landId: string | null,
): Promise<{ estudos: EstudoResumo[]; resultado: ResultadoViabilidadeCopiloto }> {
  const usos = opcoes.uso
    ? [opcoes.uso]
    : [...new Set(ctx.regras.filter((r) => r.permitted).map((r) => r.use_type))].sort()
  if (usos.length === 0) {
    throw new ErroFerramenta(
      ctx.terreno.zone
        ? `A zona ${ctx.terreno.zone.code} não tem regra validada que permita algum uso: não é possível rodar o estudo. Sugira pedir a validação ao time de analistas.`
        : "O lote não tem zona identificada: não é possível rodar o estudo sem a zona.",
    )
  }

  const estudos: EstudoResumo[] = []
  const resultados: ResultadoViabilidade[] = []
  for (const uso of usos) {
    const montada = montarEntrada(ctx, {
      uso,
      precoVendaM2: opcoes.precoVendaM2,
      usarCaMaximo: opcoes.usarCaMaximo,
    })
    if (!montada.ok) {
      estudos.push(resumoEstudo(uso, montada))
      continue
    }
    const resultado = calcularViabilidade(montada.entrada)
    resultados.push(resultado)
    const runId = await dados.registrarAnalise({ landId, entrada: montada.entrada, resultado })
    estudos.push(
      resumoEstudo(uso, {
        ok: true,
        resultado,
        avisos: [...montada.avisos, ...resultado.avisos],
        runId,
      }),
    )
  }

  return {
    estudos,
    resultado: {
      referencia: ctx.terreno.code,
      terreno_id: landId,
      estudos,
      ranking: resumoRanking(ranquearUsos(resultados)),
      disclaimer: DISCLAIMER,
    },
  }
}

export const calcularViabilidadeTerreno = ferramenta({
  nome: "calcular_viabilidade",
  rotulo: "Rodando o estudo de viabilidade",
  descricao:
    "Roda o motor de viabilidade (determinístico) para um terreno do land bank: potencial construtivo, VGV, custos, lucro, margem, TIR, payback, exposição de caixa, cenários conservador/base/otimista e score de risco, com a fonte de cada premissa. Sem `uso`, estuda todos os usos permitidos com regra validada e retorna o ranking de melhor uso (TIR ajustada ao risco). Todo número de viabilidade da resposta deve vir desta ferramenta (ou de estudar_ponto/comparar_terrenos).",
  entrada: z.object({
    terreno: zRefTerreno,
    uso: zUso.optional(),
    preco_venda_m2: zPrecoVenda.optional(),
    usar_ca_maximo: zCaMaximo.optional(),
  }),
  async executar(e, { dados }) {
    const t = await resolverTerreno(dados, e.terreno)
    const ctx = await dados.contextoTerreno(t.id, e.uso ? [e.uso] : undefined)
    if (!ctx) throw new ErroFerramenta(`Terreno ${t.code} não encontrado.`)
    const { resultado } = await estudar(
      dados,
      ctx,
      { uso: e.uso, precoVendaM2: e.preco_venda_m2, usarCaMaximo: e.usar_ca_maximo },
      t.id,
    )
    return { resultado, cartao: { tipo: "viabilidade", dados: resultado }, terrenoId: t.id }
  },
})

export const estudarPonto = ferramenta({
  nome: "estudar_ponto",
  rotulo: "Estudando o terreno informado",
  descricao:
    "Roda o motor de viabilidade para um terreno FORA do land bank, a partir de um ponto (ex.: clicado no mapa), da área e do preço do terreno informados pelo usuário. A zona vem do ponto; restrições ambientais que contêm o ponto entram no risco. Se faltar área ou preço, pergunte antes de chamar. Sem `uso`, estuda todos os usos permitidos e ranqueia.",
  entrada: z.object({
    longitude: zLongitude,
    latitude: zLatitude,
    area_m2: z
      .number()
      .positive()
      .max(10_000_000)
      .describe("Área do terreno informada pelo usuário, em m²."),
    testada_m: z
      .number()
      .positive()
      .max(10_000)
      .optional()
      .describe("Testada principal, em m, se informada."),
    preco_terreno: z
      .number()
      .positive()
      .describe(
        "Preço pedido pelo terreno, em R$. Obrigatório: se o usuário não informou, pergunte antes.",
      ),
    uso: zUso.optional(),
    preco_venda_m2: zPrecoVenda.optional(),
    usar_ca_maximo: zCaMaximo.optional(),
  }),
  async executar(e, { dados }) {
    const ctx = await dados.contextoPonto({
      longitude: e.longitude,
      latitude: e.latitude,
      areaM2: e.area_m2,
      testadaM: e.testada_m ?? null,
      precoTerreno: e.preco_terreno,
      usos: e.uso ? [e.uso] : [...USOS],
    })
    if (!ctx) {
      throw new ErroFerramenta(
        "Nenhuma zona cadastrada contém este ponto (fora das zonas ou do município coberto). Não é possível estimar; ofereça registrar um pedido de cobertura se o município não estiver coberto.",
      )
    }
    const { resultado } = await estudar(
      dados,
      ctx,
      { uso: e.uso, precoVendaM2: e.preco_venda_m2, usarCaMaximo: e.usar_ca_maximo },
      null,
    )
    return { resultado, cartao: { tipo: "viabilidade", dados: resultado } }
  },
})

export const compararTerrenos = ferramenta({
  nome: "comparar_terrenos",
  rotulo: "Comparando terrenos",
  descricao:
    "Roda o motor de viabilidade em 2 a 5 terrenos do land bank e devolve um quadro comparativo (melhor uso, margem, TIR, risco). Sem `uso`, compara o melhor uso de cada terreno; com `uso`, compara todos nesse uso.",
  entrada: z.object({
    terrenos: z
      .array(zRefTerreno)
      .min(2)
      .max(5)
      .describe("Códigos dos terrenos, ex.: ['VE-0001', 'VE-0004']."),
    uso: zUso.optional(),
  }),
  async executar(e, { dados }) {
    const linhas: ResultadoComparacao["linhas"] = []
    const detalhes: {
      codigo: string
      ranking: ResultadoViabilidadeCopiloto["ranking"]
      pendencias: string[]
    }[] = []
    for (const ref of e.terrenos) {
      const t = await resolverTerreno(dados, ref)
      const resumo = resumoTerreno(t)
      const base = {
        codigo: t.code,
        bairro: t.neighborhood,
        area_fmt: resumo.area_fmt,
        preco_fmt: resumo.preco_fmt,
        zona: t.zone?.code ?? null,
      }
      const ctx = await dados.contextoTerreno(t.id, e.uso ? [e.uso] : undefined)
      let estudo: Awaited<ReturnType<typeof estudar>> | null = null
      let erro: string | null = null
      try {
        estudo = ctx ? await estudar(dados, ctx, { uso: e.uso }, t.id) : null
      } catch (err) {
        if (!(err instanceof ErroFerramenta)) throw err
        erro = err.message
      }
      const melhor = estudo?.resultado.ranking[0]
      const escolhido = estudo?.estudos.find((x) => x.uso === melhor?.uso)
      linhas.push({
        ...base,
        melhor_uso: melhor?.elegivel ? melhor.uso_rotulo : null,
        margem_fmt: escolhido?.base?.margem_fmt ?? "—",
        tir_anual_fmt: escolhido?.base?.tir_anual_fmt ?? "—",
        risco: escolhido?.risco ? `${escolhido.risco.nivel} (${escolhido.risco.score})` : "—",
        observacao:
          erro ??
          (melhor && !melhor.elegivel
            ? `${melhor.uso_rotulo}: ${melhor.motivo}`
            : escolhido?.pendencias.length
              ? escolhido.pendencias.join(" ")
              : null),
      })
      detalhes.push({
        codigo: t.code,
        ranking: estudo?.resultado.ranking ?? [],
        pendencias: escolhido?.pendencias ?? (erro ? [erro] : []),
      })
    }
    const resultado: ResultadoComparacao = { linhas, disclaimer: DISCLAIMER }
    return {
      resultado: { ...resultado, ranking_por_terreno: detalhes },
      cartao: { tipo: "comparacao", dados: resultado },
    }
  },
})

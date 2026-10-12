import { z } from "zod"

import { NEGOTIATION_TYPE } from "@/lib/domain/labels"
import { formatArea, formatBRL } from "@/lib/format"

import { ferramenta, normalizarTexto, resolverTerreno, zRefTerreno, zUso } from "./ferramenta"
import { detalheTerreno, resumoTerreno, rotuloUso } from "./resumos"

const DISPONIVEIS = new Set(["disponivel", "em_negociacao"])

export const buscarTerrenos = ferramenta({
  nome: "buscar_terrenos",
  rotulo: "Buscando terrenos no land bank",
  descricao:
    "Busca terrenos do land bank da plataforma por filtros (bairro, município, zona, uso permitido, área, preço, forma de negociação). Por padrão retorna só os disponíveis ou em negociação, ordenados por código. Use quando o usuário pedir terrenos, opções ou oportunidades; para recomendar o melhor terreno para um perfil, busque e depois rode calcular_viabilidade ou comparar_terrenos nos candidatos.",
  entrada: z.object({
    bairro: z.string().trim().max(80).optional().describe("Bairro (ou parte do nome)."),
    municipio: z.string().trim().max(80).optional().describe("Nome do município."),
    zona: z.string().trim().max(20).optional().describe("Código da zona, ex.: ZT-2."),
    uso: zUso.optional().describe("Só terrenos cuja zona tem regra validada que permite este uso."),
    area_min_m2: z.number().positive().optional().describe("Área mínima do terreno, em m²."),
    area_max_m2: z.number().positive().optional().describe("Área máxima do terreno, em m²."),
    preco_max: z.number().positive().optional().describe("Preço pedido máximo, em R$."),
    negociacao: z
      .enum(["dinheiro", "permuta_fisica", "permuta_financeira", "misto"])
      .optional()
      .describe("Forma de negociação aceita pelo proprietário."),
    incluir_indisponiveis: z
      .boolean()
      .optional()
      .describe("Inclui terrenos reservados, vendidos ou indisponíveis."),
    limite: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Máximo de resultados (padrão 10)."),
  }),
  async executar(e, { dados }) {
    const todos = await dados.listarTerrenos()
    const filtros: string[] = []
    const contem = (valor: string | null, busca: string) =>
      valor !== null && normalizarTexto(valor).includes(normalizarTexto(busca))

    let lista = todos
    if (!e.incluir_indisponiveis) {
      lista = lista.filter((t) => DISPONIVEIS.has(t.status))
      filtros.push("disponíveis ou em negociação")
    }
    if (e.bairro) {
      lista = lista.filter((t) => contem(t.neighborhood, e.bairro!))
      filtros.push(`bairro "${e.bairro}"`)
    }
    if (e.municipio) {
      lista = lista.filter((t) => contem(t.municipality.name, e.municipio!))
      filtros.push(`município "${e.municipio}"`)
    }
    if (e.zona) {
      lista = lista.filter(
        (t) => t.zone && normalizarTexto(t.zone.code) === normalizarTexto(e.zona!),
      )
      filtros.push(`zona ${e.zona.toUpperCase()}`)
    }
    if (e.uso) {
      lista = lista.filter((t) => t.usos_permitidos.includes(e.uso!))
      filtros.push(`uso ${rotuloUso(e.uso).toLowerCase()} permitido`)
    }
    if (e.area_min_m2 !== undefined) {
      lista = lista.filter((t) => t.area_m2 !== null && t.area_m2 >= e.area_min_m2!)
      filtros.push(`área ≥ ${formatArea(e.area_min_m2)}`)
    }
    if (e.area_max_m2 !== undefined) {
      lista = lista.filter((t) => t.area_m2 !== null && t.area_m2 <= e.area_max_m2!)
      filtros.push(`área ≤ ${formatArea(e.area_max_m2)}`)
    }
    if (e.preco_max !== undefined) {
      lista = lista.filter((t) => t.preco_pedido !== null && t.preco_pedido <= e.preco_max!)
      filtros.push(`preço ≤ ${formatBRL(e.preco_max)}`)
    }
    if (e.negociacao) {
      lista = lista.filter((t) => t.negociacao === e.negociacao)
      filtros.push(`negociação ${NEGOTIATION_TYPE[e.negociacao].toLowerCase()}`)
    }

    const limite = e.limite ?? 10
    const terrenos = lista.slice(0, limite).map(resumoTerreno)
    const textoFiltros = filtros.length ? filtros.join(", ") : "sem filtros"
    return {
      resultado: {
        total_no_land_bank: todos.length,
        total_encontrado: lista.length,
        exibidos: terrenos.length,
        filtros: textoFiltros,
        terrenos,
        mensagem:
          lista.length === 0
            ? "Nenhum terreno do land bank atende aos filtros. Sugira afrouxar algum filtro; não invente terrenos."
            : lista.length > limite
              ? `Há ${lista.length} terrenos; exibidos os ${limite} primeiros.`
              : null,
      },
      cartao:
        terrenos.length > 0
          ? { tipo: "lista_terrenos", dados: { terrenos, filtros: textoFiltros } }
          : undefined,
    }
  },
})

export const obterTerreno = ferramenta({
  nome: "obter_terreno",
  rotulo: "Abrindo a ficha do terreno",
  descricao:
    "Retorna a ficha de um terreno do land bank: endereço, área, testada, topografia, preço e negociação, situação, zona atribuída, usos com regra validada e restrições (camadas ambientais que o lote cruza e o checklist do cadastro). Nunca retorna contato do proprietário.",
  entrada: z.object({ terreno: zRefTerreno }),
  async executar({ terreno: ref }, { dados }) {
    const t = await resolverTerreno(dados, ref)
    const camadas = await dados.restricoesDoTerreno(t.id)
    const detalhe = detalheTerreno(t, camadas)
    return {
      resultado: detalhe,
      cartao: { tipo: "terreno", dados: detalhe },
      terrenoId: t.id,
    }
  },
})

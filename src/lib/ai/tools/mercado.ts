import { z } from "zod"

import { estatisticaComparaveis } from "@/lib/feasibility"
import { formatBRL, formatDate, formatMonthYear, formatNumber, formatPercent } from "@/lib/format"
import {
  inicioJanela,
  PADRAO_CUB_FALLBACK,
  PADRAO_CUB_POR_USO,
  TIPOLOGIA_POR_USO,
} from "@/server/feasibility/config"

import type { AmostraPreco } from "../dados"
import type { ResultadoMercado } from "../tipos"
import {
  alvoTerrenoOuPonto,
  ErroFerramenta,
  ferramenta,
  resolverTerreno,
  zLatitude,
  zLongitude,
  zRefTerreno,
  zUso,
} from "./ferramenta"
import { rotuloUso } from "./resumos"

export const consultarMercado = ferramenta({
  nome: "consultar_mercado",
  rotulo: "Consultando comparáveis e CUB",
  descricao:
    "Retorna o mercado no entorno de um terreno ou ponto: estatística dos comparáveis de venda da tipologia do uso (n, mediana e média de R$/m², dispersão, faixa) dentro do raio e da janela configurados, e o CUB mais recente da UF para o padrão construtivo do uso. Use para perguntas de preço de venda e custo de construção. Informe `terreno` OU `longitude` + `latitude`.",
  entrada: z.object({
    terreno: zRefTerreno.optional(),
    longitude: zLongitude.optional(),
    latitude: zLatitude.optional(),
    uso: zUso
      .optional()
      .describe("Uso que define a tipologia e o padrão do CUB (padrão: residencial_vertical)."),
  }),
  async executar(e, { dados }) {
    const a = alvoTerrenoOuPonto(e)
    const uso = e.uso ?? "residencial_vertical"
    const tipologia = TIPOLOGIA_POR_USO[uso]
    const config = await dados.configMotor()
    const desde = inicioJanela(config, new Date(`${dados.hoje()}T12:00:00Z`))
    const raio = config.mercado.raioM

    let referencia: string
    let uf: string
    let amostras: AmostraPreco[]
    let terrenoId: string | undefined
    if (a.tipo === "terreno") {
      const t = await resolverTerreno(dados, a.ref)
      referencia = t.code
      uf = t.municipality.uf
      terrenoId = t.id
      amostras = await dados.comparaveisTerreno(t.id, tipologia, raio, desde)
    } else {
      referencia = `ponto ${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)}`
      const ponto = await dados.analisarPonto(a.longitude, a.latitude)
      if (!ponto.municipio) {
        throw new ErroFerramenta(
          "Nenhuma zona cadastrada contém este ponto (fora dos municípios cobertos ou sem zoneamento): não há como definir a UF do CUB. Peça um terreno do land bank ou outro ponto.",
        )
      }
      uf = ponto.municipio.uf
      amostras = await dados.comparaveisPonto(a.longitude, a.latitude, tipologia, raio, desde)
    }

    const avisos: string[] = []
    const est = estatisticaComparaveis(amostras.map((x) => x.price_m2))
    const ficticios = amostras.some((x) => x.is_fictitious)
    const tipologiaTexto = tipologia.replace("_", " ")
    if (!est) {
      avisos.push(
        `Sem comparáveis de ${tipologiaTexto} num raio de ${formatNumber(raio, 0)} m desde ${formatDate(desde)}. Não estime preço sem amostra; peça ao usuário um preço de referência.`,
      )
    } else {
      if (est.n < config.premissas.nMinimoComparaveis) {
        avisos.push(
          `Amostra pequena (${est.n} comparáveis; mínimo recomendado ${config.premissas.nMinimoComparaveis}): baixa confiança no preço.`,
        )
      }
      if (est.cv > config.premissas.cvMaximoComparaveis) {
        avisos.push(`Dispersão alta dos preços (CV ${formatPercent(est.cv)}).`)
      }
    }
    if (ficticios) avisos.push("Comparáveis fictícios (dados de teste).")

    const padrao = PADRAO_CUB_POR_USO[uso]
    let cub = await dados.cubMaisRecente(uf, padrao)
    let padraoUsado = padrao
    if (!cub && padrao !== PADRAO_CUB_FALLBACK) {
      cub = await dados.cubMaisRecente(uf, PADRAO_CUB_FALLBACK)
      padraoUsado = PADRAO_CUB_FALLBACK
      if (cub)
        avisos.push(`CUB ${padrao} não cadastrado para ${uf}: exibido o ${PADRAO_CUB_FALLBACK}.`)
    }
    if (!cub) avisos.push(`Nenhum CUB cadastrado para ${uf}.`)

    if (uso === "misto") {
      avisos.push(
        "Uso misto avaliado com preço de apartamento; a fachada ativa ainda não é modelada.",
      )
    }

    const resultado: ResultadoMercado = {
      referencia,
      tipologia: `${tipologiaTexto} (${rotuloUso(uso).toLowerCase()})`,
      comparaveis: est
        ? {
            n: est.n,
            mediana_m2_fmt: `${formatBRL(est.medianaM2)}/m²`,
            media_m2_fmt: `${formatBRL(est.mediaM2)}/m²`,
            cv_fmt: formatPercent(est.cv),
            faixa_fmt: `${formatBRL(est.minM2)}/m² a ${formatBRL(est.maxM2)}/m²`,
            raio_m: raio,
            desde_fmt: formatDate(desde),
            baixa_confianca: est.n < config.premissas.nMinimoComparaveis,
            ficticios,
          }
        : null,
      cub: cub
        ? {
            padrao: padraoUsado,
            uf,
            valor_fmt: `${formatBRL(cub.value_m2)}/m²`,
            mes_fmt: formatMonthYear(cub.reference_month),
            origem: cub.source,
          }
        : null,
      avisos,
    }
    return { resultado, cartao: { tipo: "mercado", dados: resultado }, terrenoId }
  },
})

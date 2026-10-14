import { z } from "zod"

import { COVERAGE_STATUS, ENVIRONMENTAL_LAYER_KIND, LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { RULE_FIELDS, type RuleField } from "@/lib/domain/zoning-rule-fields"
import { formatNumber, formatPercent } from "@/lib/format"

import type { MunicipioBruto, RegraComZona, TerrenoBruto } from "../dados"
import type {
  FonteTexto,
  ParametroValidado,
  RegraParametros,
  ResultadoLegislacao,
  ResultadoParametros,
  ResultadoZona,
} from "../tipos"
import {
  alvoTerrenoOuPonto,
  ErroFerramenta,
  ferramenta,
  normalizarTexto,
  resolverTerreno,
  zLatitude,
  zLongitude,
  zRefTerreno,
  zUso,
  type ContextoFerramenta,
} from "./ferramenta"
import { rotuloUso } from "./resumos"

const alvo = {
  terreno: zRefTerreno.optional(),
  longitude: zLongitude.optional(),
  latitude: zLatitude.optional(),
}

function coordenadas(longitude: number, latitude: number) {
  return `ponto ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

// identificar_zona ---------------------------------------------------------------------

export const identificarZona = ferramenta({
  nome: "identificar_zona",
  rotulo: "Identificando a zona",
  descricao:
    "Identifica a zona urbanística de um terreno do land bank (com as zonas que o lote cruza e a de maior interseção) ou de um ponto (longitude/latitude, ex.: clicado no mapa), além das restrições ambientais cadastradas que o atingem e a situação de cobertura do município. Informe `terreno` OU `longitude` + `latitude`.",
  entrada: z.object(alvo),
  async executar(e, { dados }) {
    const a = alvoTerrenoOuPonto(e)
    let resultado: ResultadoZona
    let terrenoId: string | undefined

    if (a.tipo === "terreno") {
      const t = await resolverTerreno(dados, a.ref)
      terrenoId = t.id
      const [cruzadas, camadas, municipios] = await Promise.all([
        t.zones_overlap_count > 1 ? dados.zonasCruzadas(t.id) : Promise.resolve([]),
        dados.restricoesDoTerreno(t.id),
        dados.municipios(),
      ])
      const municipio = municipios.find((m) => m.id === t.municipality.id)
      const mensagens: string[] = []
      if (!t.zone)
        mensagens.push("O lote não tem zona identificada: nenhuma zona cadastrada o intersecta.")
      else if (t.zone_assignment === "manual")
        mensagens.push("Zona atribuída manualmente por um analista.")
      if (t.zones_overlap_count > 1) {
        mensagens.push(
          `O lote cruza ${t.zones_overlap_count} zonas; a plataforma adota a de maior interseção. Confirme com o analista antes de decidir.`,
        )
      }
      resultado = {
        origem: "terreno",
        referencia: t.code,
        municipio: municipio
          ? {
              nome: municipio.name,
              uf: municipio.uf,
              cobertura: COVERAGE_STATUS[municipio.coverage_status as keyof typeof COVERAGE_STATUS],
            }
          : { nome: t.municipality.name, uf: t.municipality.uf, cobertura: "—" },
        zona: t.zone ? { id: t.zone.id, codigo: t.zone.code, nome: t.zone.name } : null,
        atribuicao: t.zone ? t.zone_assignment : "nenhuma",
        zonas_cruzadas: cruzadas.map((z) => ({
          codigo: z.code,
          percentual_fmt: formatPercent(z.overlap_ratio),
        })),
        restricoes_ambientais: camadas.map((c) => ({
          tipo: ENVIRONMENTAL_LAYER_KIND[c.kind],
          nome: c.name,
          ficticia: c.is_fictitious,
        })),
        mensagem: mensagens.join(" ") || null,
      }
    } else {
      const ponto = await dados.analisarPonto(a.longitude, a.latitude)
      let mensagem: string | null = null
      if (!ponto.municipio) {
        mensagem =
          "Nenhuma zona cadastrada contém este ponto: ele está fora dos municípios cobertos ou numa área ainda sem zoneamento na plataforma. Pergunte o município; se não estiver coberto, ofereça registrar um pedido de cobertura (solicitar_cobertura)."
      } else if (ponto.municipio.coverage_status !== "coberto") {
        mensagem = `O município ${ponto.municipio.name}/${ponto.municipio.uf} ainda não tem cobertura completa (${COVERAGE_STATUS[ponto.municipio.coverage_status as keyof typeof COVERAGE_STATUS]}).`
      }
      resultado = {
        origem: "ponto",
        referencia: coordenadas(a.longitude, a.latitude),
        municipio: ponto.municipio
          ? {
              nome: ponto.municipio.name,
              uf: ponto.municipio.uf,
              cobertura:
                COVERAGE_STATUS[ponto.municipio.coverage_status as keyof typeof COVERAGE_STATUS],
            }
          : null,
        zona: ponto.zona
          ? { id: ponto.zona.id, codigo: ponto.zona.code, nome: ponto.zona.name }
          : null,
        atribuicao: ponto.zona ? "automatica" : "nenhuma",
        zonas_cruzadas: [],
        restricoes_ambientais: ponto.camadas.map((c) => ({
          tipo: ENVIRONMENTAL_LAYER_KIND[c.kind],
          nome: c.name,
          ficticia: c.is_fictitious,
        })),
        mensagem,
      }
    }
    return { resultado, cartao: { tipo: "zona", dados: resultado }, terrenoId }
  },
})

// consultar_parametros_urbanisticos --------------------------------------------------------

const VARIAVEIS_FORMULA =
  "H = altura da edificação (m), P = pavimentos, T = testada (m), A = área do terreno (m²)"

function valorParametro(campo: RuleField, valor: number | string): string {
  switch (campo.kind) {
    case "percent":
      return formatPercent(Number(valor), 2)
    case "integer":
      return `${formatNumber(Number(valor), 0)} pavimentos`
    case "formula": {
      const texto = String(valor).trim()
      if (/^\d+([.,]\d+)?$/.test(texto)) {
        return `${formatNumber(Number(texto.replace(",", ".")))}${campo.unit ? ` ${campo.unit}` : ""}`
      }
      return `${texto} (fórmula; ${VARIAVEIS_FORMULA})`
    }
    default:
      return `${formatNumber(Number(valor), 3)}${campo.unit ? ` ${campo.unit}` : ""}`
  }
}

function fonteDoCampo(
  rc: RegraComZona,
  campo: string,
): { fonte: FonteTexto; trecho: string | null } | null {
  const s = rc.regra.rule_sources.find((x) => x.field === campo)
  if (!s) return null
  const doc = s.legal_document
  const documento = doc
    ? `${LEGAL_DOCUMENT_KIND[doc.kind]} nº ${doc.number}`
    : "Documento não encontrado"
  return {
    fonte: {
      tipo: "lei",
      texto: `${documento}, ${s.article}${doc?.is_fictitious ? " (lei fictícia, dados de teste)" : ""}`,
      ficticio: doc?.is_fictitious ?? false,
    },
    trecho: s.excerpt,
  }
}

export function parametrosDaRegra(rc: RegraComZona): RegraParametros {
  const parametros: ParametroValidado[] = []
  const naoDefinidos: string[] = []
  const regra = rc.regra as unknown as Record<string, number | string | boolean | null>
  for (const campo of RULE_FIELDS) {
    if (campo.key === "permitted") continue
    const valor = regra[campo.key]
    if (valor === null || valor === undefined || valor === "") {
      naoDefinidos.push(campo.label)
      continue
    }
    const fonte = fonteDoCampo(rc, campo.key)
    parametros.push({
      campo: campo.key,
      rotulo: campo.label,
      valor: valorParametro(campo, valor as number | string),
      fonte: fonte?.fonte ?? null,
      trecho: fonte?.trecho ?? null,
    })
  }
  return {
    uso: rc.regra.use_type,
    uso_rotulo: rotuloUso(rc.regra.use_type),
    uso_na_lei: rc.regra.use_label_local,
    permitido: rc.regra.permitted,
    parametros: rc.regra.permitted ? parametros : [],
    nao_definidos: rc.regra.permitted ? naoDefinidos : [],
    observacoes: rc.regra.observacoes,
  }
}

const PROXIMOS_PASSOS_SEM_REGRA = [
  "Pedir ao time de analistas a validação da regra desta zona (os parâmetros só entram nos estudos depois de validados).",
  "Consultar trechos da legislação com buscar_legislacao, deixando claro que texto de lei não validado não é parâmetro confirmado.",
]

export const consultarParametros = ferramenta({
  nome: "consultar_parametros_urbanisticos",
  rotulo: "Consultando os parâmetros urbanísticos validados",
  descricao:
    "Retorna os parâmetros urbanísticos VALIDADOS (CA básico/máximo, taxa de ocupação, permeabilidade, gabarito, recuos frontal/lateral/fundos, lote e testada mínimos, outorga) da zona de um terreno ou ponto, com a lei e o artigo de cada valor. Sem `uso`, retorna todos os usos com regra validada na zona. É a ÚNICA fonte aceitável para afirmar um parâmetro: se o status não for `validado`, declare a ausência e sugira os próximos passos. Informe `terreno` OU `longitude` + `latitude`.",
  entrada: z.object({ ...alvo, uso: zUso.optional() }),
  async executar(e, { dados }) {
    const a = alvoTerrenoOuPonto(e)
    let referencia: string
    let zona: { id: string; codigo: string; nome: string } | null = null
    let terrenoId: string | undefined
    if (a.tipo === "terreno") {
      const t = await resolverTerreno(dados, a.ref)
      referencia = t.code
      terrenoId = t.id
      if (t.zone) zona = { id: t.zone.id, codigo: t.zone.code, nome: t.zone.name }
    } else {
      referencia = coordenadas(a.longitude, a.latitude)
      const ponto = await dados.analisarPonto(a.longitude, a.latitude)
      if (ponto.zona) zona = { id: ponto.zona.id, codigo: ponto.zona.code, nome: ponto.zona.name }
    }

    let resultado: ResultadoParametros
    if (!zona) {
      resultado = {
        referencia,
        status: "sem_zona",
        zona: null,
        regras: [],
        mensagem: `Não há zona cadastrada para ${referencia}; sem zona não há parâmetro validado.`,
        proximos_passos: [
          "Conferir a localização (o lote pode estar fora das zonas cadastradas).",
          "Pedir ao analista a atribuição manual da zona ou registrar um pedido de cobertura.",
        ],
      }
    } else {
      const regras = e.uso
        ? [await dados.regraValidada(zona.id, e.uso)].filter((r): r is RegraComZona => r !== null)
        : await dados.regrasValidadas(zona.id)
      if (regras.length === 0) {
        const outros = e.uso ? await dados.regrasValidadas(zona.id) : []
        resultado = {
          referencia,
          status: "sem_regra_validada",
          zona,
          regras: [],
          mensagem: e.uso
            ? `A zona ${zona.codigo} não tem regra validada para o uso ${rotuloUso(e.uso).toLowerCase()}.${outros.length ? ` Usos com regra validada nesta zona: ${outros.map((r) => rotuloUso(r.regra.use_type).toLowerCase()).join(", ")}.` : ""}`
            : `A zona ${zona.codigo} ainda não tem regras validadas.`,
          proximos_passos: PROXIMOS_PASSOS_SEM_REGRA,
        }
      } else {
        resultado = {
          referencia,
          status: "validado",
          zona,
          regras: regras.map(parametrosDaRegra),
          mensagem: regras.some((r) =>
            r.regra.rule_sources.some((s) => s.legal_document?.is_fictitious),
          )
            ? "Atenção: parâmetros de lei fictícia (dados de teste da plataforma)."
            : null,
          proximos_passos: [],
        }
      }
    }
    return { resultado, cartao: { tipo: "parametros", dados: resultado }, terrenoId }
  },
})

// buscar_legislacao ---------------------------------------------------------------------

async function resolverMunicipio(
  dados: ContextoFerramenta["dados"],
  e: { terreno?: string; municipio?: string },
): Promise<MunicipioBruto> {
  const municipios = await dados.municipios()
  let t: TerrenoBruto | null = null
  if (e.terreno) t = await resolverTerreno(dados, e.terreno)
  const encontrado = t
    ? municipios.find((m) => m.id === t.municipality.id)
    : e.municipio
      ? municipios.find((m) => normalizarTexto(m.name) === normalizarTexto(e.municipio!))
      : municipios.filter((m) => m.coverage_status === "coberto").length === 1
        ? municipios.find((m) => m.coverage_status === "coberto")
        : undefined
  if (!encontrado) {
    throw new ErroFerramenta(
      e.municipio
        ? `O município "${e.municipio}" não está cadastrado na plataforma. Municípios disponíveis: ${municipios.map((m) => `${m.name}/${m.uf}`).join(", ")}.`
        : "Informe o município ou o terreno para buscar a legislação.",
    )
  }
  return encontrado
}

const LIMITE_TRECHO = 1200

export const buscarLegislacao = ferramenta({
  nome: "buscar_legislacao",
  rotulo: "Pesquisando a legislação municipal",
  descricao:
    "Busca trechos do texto das leis urbanísticas vigentes indexadas do município (plano diretor, LUOS etc.), por palavras e por sentido. Cada trecho traz lei, artigo e página do PDF oficial. Use para explicar conceitos e contexto legal, ou quando não houver parâmetro validado. Trechos de lei NÃO são parâmetros validados: nunca use um número achado aqui como parâmetro do estudo. Informe `terreno` ou `municipio`.",
  entrada: z.object({
    pergunta: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .describe("Termos da busca, ex.: 'recuo frontal zona ZT-2'."),
    terreno: zRefTerreno.optional(),
    municipio: z.string().trim().max(80).optional().describe("Nome do município, ex.: Fortaleza."),
  }),
  async executar(e, { dados }) {
    const municipio = await resolverMunicipio(dados, e)
    const total = await dados.contarTrechosLegais(municipio.id)
    const trechos = total > 0 ? await dados.buscarTextoLegal(municipio.id, e.pergunta) : []
    const resultado: ResultadoLegislacao = {
      municipio: `${municipio.name}/${municipio.uf}`,
      trechos: trechos.map((t) => ({
        documento: t.documento,
        artigo: t.article,
        paginas:
          t.page_start === null
            ? null
            : t.page_end && t.page_end !== t.page_start
              ? `p. ${t.page_start}–${t.page_end}`
              : `p. ${t.page_start}`,
        texto:
          t.content.length > LIMITE_TRECHO ? `${t.content.slice(0, LIMITE_TRECHO)}…` : t.content,
        ficticio: t.is_fictitious,
      })),
      aviso:
        total === 0
          ? `A legislação de ${municipio.name}/${municipio.uf} ainda não foi indexada na plataforma: não há texto legal para citar. Diga isso ao usuário e use apenas parâmetros validados.`
          : trechos.length === 0
            ? "Nenhum trecho encontrado para estes termos. Tente outras palavras ou diga que não encontrou."
            : "Trechos de lei para contexto. Não são parâmetros validados pelo time de analistas.",
    }
    return {
      resultado,
      cartao: resultado.trechos.length > 0 ? { tipo: "legislacao", dados: resultado } : undefined,
    }
  },
})

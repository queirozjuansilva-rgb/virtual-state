/**
 * Divisão do texto da lei em trechos para a busca (RAG). A unidade natural é
 * o artigo: cada trecho começa em "Art. N" e guarda o artigo, a seção (Título,
 * Capítulo, Seção) e as páginas. Artigos longos são partidos em parágrafos ou
 * incisos; artigos curtos e vizinhos são agrupados. Anexos (tabelas, quadros)
 * são partidos por tamanho, com o rótulo do anexo.
 */

export type PaginaTexto = { numero: number; texto: string }

export type Fragmento = {
  indice: number
  artigo: string | null
  secao: string | null
  conteudo: string
  paginaInicio: number
  paginaFim: number
}

/** ~600 tokens: cabe vários na resposta da busca e mantém o artigo inteiro na maioria dos casos. */
export const LIMITE_CARACTERES = 2400
const MINIMO_PARA_AGRUPAR = 600

const INICIO_ARTIGO =
  /^\s*Art(?:igo)?\.?\s*(\d{1,4})(?:[-–]([A-Z])(?![a-zà-ú]))?(?:\s*[º°o](?![a-zà-ú]))?/
const CABECALHO =
  /^\s*(T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|Se[çc][ãa]o|Subse[çc][ãa]o)\s+([IVXLCDM]+|\d+|[ÚU]NIC[OA])\b/
const INICIO_ANEXO = /^\s*ANEXO\s+([IVXLCDM]+|\d+)(?:\s*[-–.]?\s*([A-Z])(?![A-ZÀ-Ú]))?\b/
/** Pontos bons para partir um artigo longo: parágrafo, inciso ou alínea. */
const PONTO_DE_CORTE = /^\s*(§|Par[áa]grafo|[IVXLCDM]+\s*[-–.]|[a-z]\))/

type Linha = { pagina: number; texto: string }
type Bloco = { artigo: string | null; secao: string | null; linhas: Linha[] }

/**
 * Texto corrido (Diário Oficial em colunas, OCR sem quebras): o artigo começa
 * no meio da linha. Quebra antes de "Art. N" seguido de separador e caput em
 * maiúscula, quando vem depois de fim de frase, parêntese ou título em
 * maiúsculas; e antes de "SEÇÃO/Seção II" depois de fim de frase. Referência
 * no meio da frase ("conforme o art. 5º desta Lei") não casa.
 */
const ARTIGO_NO_MEIO =
  /(?<=[.;:)\]A-ZÀ-Ú])[ \t]+(?=Art(?:igo)?\.?\s*\d{1,4}(?:[-–][A-Z])?\s*[º°o]?\s*[.\-–—]\s*[A-ZÀ-Ú])/g
const CABECALHO_NO_MEIO =
  /(?<=[.;:])[ \t]+(?=(?:T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|T[íi]tulo|Cap[íi]tulo|Se[çc][ãa]o|Subse[çc][ãa]o)\s+[IVXLCDM]+\b)/g

export function quebrarTextoCorrido(texto: string): string {
  return texto.replace(CABECALHO_NO_MEIO, "\n").replace(ARTIGO_NO_MEIO, "\n")
}

function linhasDasPaginas(paginas: readonly PaginaTexto[]): Linha[] {
  const linhas: Linha[] = []
  for (const p of paginas) {
    for (const bruta of quebrarTextoCorrido(p.texto).split("\n")) {
      const texto = bruta.replace(/\s+/g, " ").trim()
      if (texto) linhas.push({ pagina: p.numero, texto })
    }
  }
  return linhas
}

function rotuloArtigo(m: RegExpMatchArray): string {
  return `Art. ${m[1]}${m[2] ? `-${m[2]}` : ""}`
}

function juntar(linhas: readonly Linha[]): string {
  let texto = ""
  for (const { texto: linha } of linhas) {
    if (!texto) texto = linha
    // Hífen de quebra de linha: "edifi-" + "cação" → "edificação".
    else if (/\p{L}-$/u.test(texto) && /^\p{Ll}/u.test(linha)) texto = texto.slice(0, -1) + linha
    else texto += "\n" + linha
  }
  return texto
}

function separarBlocos(linhas: readonly Linha[]): Bloco[] {
  const blocos: Bloco[] = []
  let atual: Bloco = { artigo: null, secao: null, linhas: [] }
  let secao: string | null = null
  let emAnexo = false

  const abrir = (artigo: string | null) => {
    if (atual.linhas.length > 0) blocos.push(atual)
    atual = { artigo, secao, linhas: [] }
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const anexo = linha.texto.match(INICIO_ANEXO)
    if (anexo && linha.texto === linha.texto.toUpperCase()) {
      emAnexo = true
      secao = linha.texto.slice(0, 160)
      abrir(`Anexo ${anexo[1]}${anexo[2] ? `-${anexo[2]}` : ""}`)
      atual.linhas.push(linha)
      continue
    }
    if (!emAnexo) {
      const cab = linha.texto.match(CABECALHO)
      if (cab) {
        // O título costuma vir na linha seguinte ("Seção II" / "Da Zona ...").
        const seguinte = linhas[i + 1]?.texto
        const titulo =
          seguinte &&
          seguinte.length < 140 &&
          !INICIO_ARTIGO.test(seguinte) &&
          !CABECALHO.test(seguinte)
            ? `${linha.texto}: ${seguinte}`
            : linha.texto
        secao = titulo.slice(0, 200)
      }
      const art = linha.texto.match(INICIO_ARTIGO)
      if (art) {
        abrir(rotuloArtigo(art))
        atual.linhas.push(linha)
        continue
      }
    }
    atual.linhas.push(linha)
  }
  if (atual.linhas.length > 0) blocos.push(atual)
  return blocos
}

/** Parte um bloco longo em pedaços de até LIMITE, preferindo parágrafos e incisos. */
function partir(bloco: Bloco): Bloco[] {
  const total = bloco.linhas.reduce((s, l) => s + l.texto.length + 1, 0)
  if (total <= LIMITE_CARACTERES) return [bloco]

  const partes: Linha[][] = []
  let atual: Linha[] = []
  let tamanho = 0
  for (const linha of bloco.linhas) {
    const cabe = tamanho + linha.texto.length + 1 <= LIMITE_CARACTERES
    const bomCorte = PONTO_DE_CORTE.test(linha.texto) && tamanho >= LIMITE_CARACTERES * 0.5
    if (atual.length > 0 && (!cabe || bomCorte)) {
      partes.push(atual)
      atual = []
      tamanho = 0
    }
    // Linha maior que o limite (tabela achatada, OCR sem quebras): corta no meio.
    if (linha.texto.length > LIMITE_CARACTERES) {
      for (let i = 0; i < linha.texto.length; i += LIMITE_CARACTERES) {
        partes.push([{ pagina: linha.pagina, texto: linha.texto.slice(i, i + LIMITE_CARACTERES) }])
      }
      continue
    }
    atual.push(linha)
    tamanho += linha.texto.length + 1
  }
  if (atual.length > 0) partes.push(atual)

  return partes.map((linhas, i) => ({
    artigo: bloco.artigo ? `${bloco.artigo} (parte ${i + 1} de ${partes.length})` : null,
    secao: bloco.secao,
    linhas,
  }))
}

/** Agrupa artigos curtos e vizinhos da mesma seção ("Art. 5 a Art. 7"). */
function agrupar(blocos: readonly Bloco[]): Bloco[] {
  const saida: (Bloco & { primeiro: string | null; ultimo: string | null })[] = []
  for (const b of blocos) {
    const anterior = saida.at(-1)
    const tam = (x: Bloco) => x.linhas.reduce((s, l) => s + l.texto.length + 1, 0)
    const agrupavel = (x: Bloco) =>
      x.artigo !== null && x.artigo.startsWith("Art.") && !x.artigo.includes("parte")
    if (
      anterior &&
      agrupavel(b) &&
      agrupavel(anterior) &&
      anterior.secao === b.secao &&
      tam(b) < MINIMO_PARA_AGRUPAR &&
      tam(anterior) + tam(b) <= LIMITE_CARACTERES
    ) {
      anterior.linhas.push(...b.linhas)
      anterior.ultimo = b.artigo
      anterior.artigo = `${anterior.primeiro} a ${anterior.ultimo}`
      continue
    }
    saida.push({ ...b, linhas: [...b.linhas], primeiro: b.artigo, ultimo: b.artigo })
  }
  return saida.map(({ artigo, secao, linhas }) => ({ artigo, secao, linhas }))
}

export function fragmentar(paginas: readonly PaginaTexto[]): Fragmento[] {
  const blocos = agrupar(separarBlocos(linhasDasPaginas(paginas))).flatMap(partir)
  return blocos.map((b, indice) => ({
    indice,
    artigo: b.artigo,
    secao: b.secao,
    conteudo: juntar(b.linhas),
    paginaInicio: b.linhas[0].pagina,
    paginaFim: b.linhas.at(-1)!.pagina,
  }))
}

/** Texto enviado ao modelo de embeddings: seção e artigo dão contexto ao trecho. */
export function textoParaEmbedding(f: Pick<Fragmento, "secao" | "artigo" | "conteudo">): string {
  return [f.secao, f.artigo, f.conteudo].filter(Boolean).join("\n")
}

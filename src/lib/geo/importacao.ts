/**
 * Importação de camadas oficiais em GeoJSON (Fase 5): zoneamento e
 * condicionantes publicados pela prefeitura (ex.: Fortaleza em Mapas). Aqui só
 * leitura, resumo e agrupamento, sem I/O; a geometria é validada e corrigida no
 * banco (ST_MakeValid) na gravação.
 */

type Feicao = {
  type: "Feature"
  properties: Record<string, unknown> | null
  geometry: { type: string; coordinates: unknown } | null
}

export type ResumoCamada = {
  feicoes: number
  poligonos: number
  tiposGeometria: string[]
  propriedades: { nome: string; exemplos: string[]; distintos: number }[]
}

export function lerColecao(json: unknown): Feicao[] {
  const obj = json as { type?: string; features?: unknown }
  if (obj?.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    throw new Error("O arquivo não é um GeoJSON FeatureCollection.")
  }
  return obj.features.filter((f): f is Feicao => (f as Feicao)?.type === "Feature")
}

const ehPoligono = (f: Feicao) =>
  f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"

/** Texto limpo de um atributo (o Fortaleza em Mapas traz HTML na descrição). */
export function textoDoAtributo(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function resumirCamada(feicoes: readonly Feicao[]): ResumoCamada {
  const props = new Map<string, Set<string>>()
  for (const f of feicoes) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      const t = textoDoAtributo(v)
      if (!props.has(k)) props.set(k, new Set())
      if (t) props.get(k)!.add(t.slice(0, 80))
    }
  }
  return {
    feicoes: feicoes.length,
    poligonos: feicoes.filter(ehPoligono).length,
    tiposGeometria: [...new Set(feicoes.map((f) => f.geometry?.type ?? "sem geometria"))],
    propriedades: [...props].map(([nome, valores]) => ({
      nome,
      exemplos: [...valores].slice(0, 6),
      distintos: valores.size,
    })),
  }
}

const PALAVRAS_MENORES = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em"])

/**
 * Sigla proposta para uma zona pelo nome (o admin confere e pode editar):
 * "Zona de Ocupação Preferencial 1" → "ZOP 1" · "Zona da Orla - Trecho III" → "ZO T-III".
 */
export function siglaDaZona(nome: string): string {
  const [principal, ...resto] = nome.split(/\s+[-–]\s+/)
  const palavras = principal.trim().split(/\s+/)
  let sigla = ""
  const sufixos: string[] = []
  for (const p of palavras) {
    if (/^(\d+|[IVXLC]+)$/.test(p)) sufixos.push(p)
    else if (!PALAVRAS_MENORES.has(p.toLowerCase())) sigla += p[0]!.toUpperCase()
  }
  const partes = resto.map((r) => {
    const m = r.trim().match(/^(\p{L})\p{L}*\s+(.+)$/u)
    return m
      ? `${m[1]!.toUpperCase()}-${m[2]!.replace(/\s+/g, " ").toUpperCase()}`
      : r.trim().toUpperCase()
  })
  return [sigla + (sufixos.length ? ` ${sufixos.join(" ")}` : ""), ...partes].join(" ").slice(0, 40)
}

/** Junta os polígonos das feições que têm o mesmo valor no atributo escolhido. */
export function agruparPorAtributo(
  feicoes: readonly Feicao[],
  atributo: string,
): {
  valor: string
  geometria: { type: "MultiPolygon"; coordinates: unknown[] }
  feicoes: Feicao[]
}[] {
  const grupos = new Map<string, Feicao[]>()
  for (const f of feicoes.filter(ehPoligono)) {
    const valor = textoDoAtributo(f.properties?.[atributo])
    if (!valor) continue
    if (!grupos.has(valor)) grupos.set(valor, [])
    grupos.get(valor)!.push(f)
  }
  return [...grupos].map(([valor, fs]) => ({
    valor,
    feicoes: fs,
    geometria: {
      type: "MultiPolygon" as const,
      coordinates: fs.flatMap((f) =>
        f.geometry!.type === "Polygon"
          ? [f.geometry!.coordinates]
          : (f.geometry!.coordinates as unknown[]),
      ),
    },
  }))
}

/** Feições poligonais com nome (para camadas de condicionantes, uma linha por feição). */
export function feicoesComNome(
  feicoes: readonly Feicao[],
  atributo: string | null,
): { name: string; geojson: Feicao["geometry"] }[] {
  return feicoes.filter(ehPoligono).map((f) => ({
    name: atributo ? textoDoAtributo(f.properties?.[atributo]).slice(0, 200) : "",
    geojson: f.geometry,
  }))
}

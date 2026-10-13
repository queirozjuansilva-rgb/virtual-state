import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { configCopiloto, temChaveAnthropic } from "../config"
import { executarTurno, type ChamadaFerramenta } from "../copiloto"
import { VERSAO_PROMPT } from "../prompts"
import { CASOS, type CasoEval, type ChamadaEsperada } from "./casos"
import { criarDadosFixture } from "./fixture/dados-fixture"
import { normalizarResposta, numerosSemOrigem } from "./verificacao"

/**
 * Evals do copiloto com o modelo real (npm run evals). Custa chamadas à API:
 * ~25 turnos por rodada. Meta do PRD: ≥ 90% dos casos passando.
 */

const META = 0.9
const CONCORRENCIA = 4

type Resultado = {
  caso: CasoEval
  passou: boolean
  falhas: string[]
  resposta: string
  chamadas: ChamadaFerramenta[]
  tokensEntrada: number
  tokensSaida: number
  segundos: number
}

function contextoDoCaso(caso: CasoEval) {
  return [
    "Contexto desta mensagem (gerado pela plataforma; não foi escrito pelo usuário):",
    "- Data de hoje: 12/10/2026.",
    "- Usuário: Analista de testes.",
    ...(caso.contexto ?? ["- Perfil do investidor: não preenchido."]),
  ].join("\n")
}

function igual(esperado: unknown, recebido: unknown): boolean {
  if (typeof esperado === "number" && typeof recebido === "number") {
    return Math.abs(esperado - recebido) <= Math.abs(esperado) * 1e-6
  }
  if (typeof esperado === "string" && typeof recebido === "string") {
    const n = (s: string) => s.toLowerCase().replace(/[\s-]/g, "").replace(/^ve0*/, "ve")
    return n(esperado) === n(recebido)
  }
  return esperado === recebido
}

function chamou(esperada: ChamadaEsperada, chamadas: ChamadaFerramenta[]) {
  return chamadas.some(
    (c) =>
      c.nome === esperada.nome &&
      Object.entries(esperada.entrada ?? {}).every(([k, v]) =>
        igual(v, (c.entrada as Record<string, unknown>)[k]),
      ),
  )
}

async function avaliar(caso: CasoEval): Promise<Resultado> {
  const inicio = Date.now()
  const contexto = contextoDoCaso(caso)
  const r = await executarTurno({
    historico: caso.historico ?? [],
    pergunta: [{ type: "text", text: caso.pergunta }],
    contexto,
    ferramentas: { dados: criarDadosFixture() },
    emitir: () => {},
    registrar: async () => {},
  })
  const resposta = normalizarResposta(r.texto)
  const falhas: string[] = []

  if (!resposta.trim()) falhas.push("resposta vazia")
  if (caso.chama && !caso.chama.some((grupo) => grupo.every((e) => chamou(e, r.chamadas)))) {
    falhas.push(
      `não chamou ${caso.chama.map((g) => g.map((e) => e.nome).join(" + ")).join(" ou ")}`,
    )
  }
  for (const nome of caso.naoChama ?? []) {
    if (r.chamadas.some((c) => c.nome === nome)) falhas.push(`chamou ${nome} sem poder`)
  }
  if (caso.semFerramentas && r.chamadas.length > 0) {
    falhas.push(`chamou ferramentas: ${r.chamadas.map((c) => c.nome).join(", ")}`)
  }
  for (const re of caso.contem ?? []) if (!re.test(resposta)) falhas.push(`faltou ${re}`)
  for (const re of caso.naoContem ?? [])
    if (re.test(resposta)) falhas.push(`não devia conter ${re}`)
  if (!caso.ignorarNumeros) {
    const fontes = [
      caso.pergunta,
      contexto,
      ...(caso.historico ?? []).map((m) => m.content),
      ...r.chamadas.flatMap((c) => [c.entrada, c.resultado]),
    ]
    const soltos = numerosSemOrigem(resposta, fontes)
    if (soltos.length) falhas.push(`números sem origem: ${soltos.join(", ")}`)
  }

  return {
    caso,
    passou: falhas.length === 0,
    falhas,
    resposta,
    chamadas: r.chamadas,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    segundos: (Date.now() - inicio) / 1000,
  }
}

async function emLotes<T, R>(itens: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let proximo = 0
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++
        saida[i] = await fn(itens[i])
      }
    }),
  )
  return saida
}

function relatorio(resultados: Resultado[], taxa: number) {
  const linhas = [
    "# Evals do copiloto",
    "",
    `- Data: ${new Date().toISOString()}`,
    `- Modelo: ${configCopiloto.ANTHROPIC_MODEL} · esforço ${configCopiloto.COPILOTO_EFFORT} · prompt ${VERSAO_PROMPT}`,
    `- Resultado: **${resultados.filter((r) => r.passou).length}/${resultados.length} (${(taxa * 100).toFixed(1)}%)**, meta ${META * 100}%`,
    `- Tokens: ${resultados.reduce((s, r) => s + r.tokensEntrada, 0)} de entrada, ${resultados.reduce((s, r) => s + r.tokensSaida, 0)} de saída`,
    "",
    "| Caso | Resultado | Ferramentas | Falhas |",
    "| --- | --- | --- | --- |",
    ...resultados.map(
      (r) =>
        `| ${r.caso.id} | ${r.passou ? "✅" : "❌"} | ${r.chamadas.map((c) => c.nome).join(", ") || "—"} | ${r.falhas.join("; ").replace(/\|/g, "\\|") || "—"} |`,
    ),
    "",
    "## Respostas",
    "",
    ...resultados.flatMap((r) => [
      `### ${r.caso.id} ${r.passou ? "✅" : "❌"}`,
      "",
      `**Pergunta:** ${r.caso.pergunta}`,
      "",
      r.resposta
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
      "",
    ]),
  ]
  return linhas.join("\n")
}

describe.skipIf(!temChaveAnthropic())("evals do copiloto", () => {
  it(`passa em pelo menos ${META * 100}% dos casos`, async () => {
    const filtro = process.env.EVAL_CASOS?.split(",").map((s) => s.trim())
    const casos = filtro ? CASOS.filter((c) => filtro.includes(c.id)) : CASOS
    const resultados = await emLotes(casos, CONCORRENCIA, avaliar)
    const taxa = resultados.filter((r) => r.passou).length / resultados.length

    const arquivo = path.join(process.cwd(), "docs/validacao/evals-copiloto.md")
    await mkdir(path.dirname(arquivo), { recursive: true })
    await writeFile(arquivo, relatorio(resultados, taxa))

    for (const r of resultados) {
      console.log(
        `${r.passou ? "✅" : "❌"} ${r.caso.id} (${r.segundos.toFixed(1)}s)${r.falhas.length ? `: ${r.falhas.join("; ")}` : ""}`,
      )
    }
    console.log(
      `\nTaxa de acerto: ${(taxa * 100).toFixed(1)}% · relatório em docs/validacao/evals-copiloto.md`,
    )
    expect(taxa).toBeGreaterThanOrEqual(META)
  })
})

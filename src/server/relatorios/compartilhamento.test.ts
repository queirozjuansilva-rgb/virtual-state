import { readdirSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Supabase } from "@/server/feasibility/carregar-contexto"

/**
 * Link público do relatório: criação, acesso sem login e revogação, ponta a
 * ponta pelo código do app (ação, carregador, proxy e rota do PDF). O banco é
 * simulado com a mesma regra de `relatorio_compartilhado`
 * (supabase/migrations/20261013040000_relatorios.sql): token não nulo, com
 * 32+ caracteres e igual ao gravado no momento da consulta.
 */

const RELATORIO_ID = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f"
const OUTRO_ID = "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b"

const banco = vi.hoisted(() => ({
  relatorios: new Map<string, { share_token: string | null }>(),
  rpcChamadas: 0,
  falharUpdate: false,
}))

vi.mock("@/lib/auth/dal", () => ({ requireUser: vi.fn(async () => ({ id: "usuario-1" })) }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => clienteFalso()) }))
vi.mock("@/server/relatorios/pdf/gerar", async (original) => ({
  ...(await original<typeof import("@/server/relatorios/pdf/gerar")>()),
  gerarPdfRelatorio: vi.fn(async () => Buffer.from("%PDF-1.7 teste")),
}))
// O conteúdo do relatório traz o mapa (MapLibre), que não carrega fora do navegador.
vi.mock("@/components/relatorio/relatorio-conteudo", () => ({ RelatorioConteudo: () => null }))
// Proxy: visitante sem sessão, com a mesma RPC do banco simulado.
vi.mock("@/lib/env", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://projeto.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-publica",
  },
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: null }) },
    rpc: clienteFalso().rpc,
  }),
}))

const { requireUser } = await import("@/lib/auth/dal")
const { refresh } = await import("next/cache")
const { alternarCompartilhamento } = await import("./actions")
const { carregarCompartilhado } = await import("./compartilhado")
const { GET: baixarPdf } = await import("@/app/r/[token]/pdf/route")
const paginaPublica = await import("@/app/r/[token]/page")
const { updateSession } = await import("@/lib/supabase/proxy")
const { CAMINHO_NAO_ENCONTRADO } = await import("@/lib/relatorio/link-publico")
const { default: nextConfig } = await import("../../../next.config")

/** Cliente com só o que o compartilhamento usa; a RLS é a presença da linha no mapa. */
function clienteFalso(): Supabase {
  return {
    from(tabela: string) {
      expect(tabela).toBe("reports")
      return {
        update(valores: { share_token: string | null }) {
          return {
            eq(_coluna: string, id: string) {
              return {
                select: () => ({
                  async maybeSingle() {
                    if (banco.falharUpdate) {
                      return {
                        data: null,
                        error: {
                          code: "23505",
                          message:
                            'duplicate key value violates unique constraint "reports_share_token_key"',
                          details: `Key (share_token)=(${valores.share_token}) already exists.`,
                        },
                      }
                    }
                    const linha = banco.relatorios.get(id)
                    if (!linha) return { data: null, error: null }
                    linha.share_token = valores.share_token
                    return { data: { id }, error: null }
                  },
                }),
              }
            },
          }
        },
      }
    },
    async rpc(nome: string, args: { p_token: string }) {
      expect(nome).toBe("relatorio_compartilhado")
      banco.rpcChamadas++
      const t = args.p_token
      const achado = [...banco.relatorios.values()].some(
        (r) => t !== null && t.length >= 32 && r.share_token === t,
      )
      return {
        data: achado
          ? {
              titulo: "Estudo VE-0001",
              organizacao: "Org de teste",
              contexto: {},
              versao: 3,
              salvo_em: "2026-10-14T01:30:00Z",
              engine_version: "0.1.0",
              input: {},
              output: {},
              terreno: null,
            }
          : null,
        error: null,
      }
    },
  } as unknown as Supabase
}

const pdfDoLink = (token: string) =>
  baixarPdf(new Request(`http://localhost/r/${token}/pdf`), {
    params: Promise.resolve({ token }),
  } as Parameters<typeof baixarPdf>[1])

/** Todo texto que chegou ao console nesta execução. */
let logs: string[]

beforeEach(() => {
  banco.relatorios = new Map([[RELATORIO_ID, { share_token: null }]])
  banco.rpcChamadas = 0
  banco.falharUpdate = false
  logs = []
  for (const metodo of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

async function ligar(id = RELATORIO_ID) {
  const r = await alternarCompartilhamento(id, true)
  if (!r.ok || !r.token) throw new Error("esperava link ativo")
  return r.token
}

describe("criação do link", () => {
  it("exige login, gera token aleatório de 43 caracteres e grava no relatório", async () => {
    const token = await ligar()
    expect(requireUser).toHaveBeenCalled()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(banco.relatorios.get(RELATORIO_ID)?.share_token).toBe(token)
    expect(refresh).toHaveBeenCalled()
  })

  it("cada ativação gera um token diferente", async () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 20; i++) tokens.add(await ligar())
    expect(tokens.size).toBe(20)
  })

  it("sem login, nada é gravado", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("NEXT_REDIRECT"))
    await expect(alternarCompartilhamento(RELATORIO_ID, true)).rejects.toThrow("NEXT_REDIRECT")
    expect(banco.relatorios.get(RELATORIO_ID)?.share_token).toBeNull()
  })

  it("id inválido ou relatório de outra organização (RLS) devolve erro", async () => {
    expect(await alternarCompartilhamento("nao-e-uuid", true)).toEqual({
      ok: false,
      erro: "Relatório inválido.",
    })
    expect(await alternarCompartilhamento(OUTRO_ID, true)).toEqual({
      ok: false,
      erro: "Não foi possível alterar o compartilhamento.",
    })
  })
})

describe("acesso público", () => {
  it("token ativo abre a última versão sem login, e o PDF não fica em cache", async () => {
    const token = await ligar()
    const relatorio = await carregarCompartilhado(clienteFalso(), token)
    expect(relatorio).toMatchObject({
      titulo: "Estudo VE-0001",
      versao: { versao: 3, salvaEm: "2026-10-14T01:30:00Z" },
    })

    const resposta = await pdfDoLink(token)
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("Content-Type")).toBe("application/pdf")
    expect(resposta.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("token malformado não chega ao banco", async () => {
    await ligar()
    for (const t of ["", "curto", "a".repeat(31), `${"a".repeat(40)}/../x`, `${"a".repeat(40)} `]) {
      expect(await carregarCompartilhado(clienteFalso(), t)).toBeNull()
    }
    expect(banco.rpcChamadas).toBe(0)
  })

  it("token bem formado mas desconhecido dá 404", async () => {
    await ligar()
    const resposta = await pdfDoLink("x".repeat(43))
    expect(resposta.status).toBe(404)
  })
})

describe("revogação", () => {
  it("desligar apaga o token e o link para na consulta seguinte", async () => {
    const token = await ligar()
    expect(await carregarCompartilhado(clienteFalso(), token)).not.toBeNull()

    expect(await alternarCompartilhamento(RELATORIO_ID, false)).toEqual({ ok: true, token: null })
    expect(banco.relatorios.get(RELATORIO_ID)?.share_token).toBeNull()

    expect(await carregarCompartilhado(clienteFalso(), token)).toBeNull()
    const resposta = await pdfDoLink(token)
    expect(resposta.status).toBe(404)
    expect(await resposta.text()).toBe("Link inválido ou desativado.")
  })

  it("religar gera token novo e o antigo continua inválido", async () => {
    const antigo = await ligar()
    await alternarCompartilhamento(RELATORIO_ID, false)
    const novo = await ligar()
    expect(novo).not.toBe(antigo)
    expect(await carregarCompartilhado(clienteFalso(), antigo)).toBeNull()
    expect(await carregarCompartilhado(clienteFalso(), novo)).not.toBeNull()
    expect((await pdfDoLink(antigo)).status).toBe(404)
  })
})

describe("logs", () => {
  it("nenhum fluxo escreve o token no console, nem quando o banco devolve erro com ele", async () => {
    const token = await ligar()
    await carregarCompartilhado(clienteFalso(), token)
    await pdfDoLink(token)
    await alternarCompartilhamento(RELATORIO_ID, false)
    await pdfDoLink(token)

    banco.falharUpdate = true
    const falha = await alternarCompartilhamento(RELATORIO_ID, true)
    expect(falha).toEqual({ ok: false, erro: "Não foi possível alterar o compartilhamento." })

    expect(logs.join("\n")).toContain("23505")
    for (const linha of logs) {
      expect(linha).not.toContain(token)
      expect(linha).not.toMatch(/Key \(share_token\)/)
    }
  })
})

describe("página pública /r/[token]", () => {
  const visitar = (caminho: string) => updateSession(new NextRequest(`http://localhost${caminho}`))

  it("token desativado, inexistente ou malformado: o proxy responde 404 real", async () => {
    const token = await ligar()
    const ativo = await visitar(`/r/${token}`)
    expect(ativo.status).toBe(200)
    expect(ativo.headers.get("x-middleware-rewrite")).toBeNull()

    await alternarCompartilhamento(RELATORIO_ID, false)
    for (const caminho of [`/r/${token}`, `/r/${token}/`, `/r/${"x".repeat(43)}`, "/r/curto"]) {
      const r = await visitar(caminho)
      expect(r.status, caminho).toBe(404)
      // Mesma tela "não encontrada" do app: o caminho reescrito não tem rota.
      expect(new URL(r.headers.get("x-middleware-rewrite")!).pathname).toBe(CAMINHO_NAO_ENCONTRADO)
    }
  })

  it("o PDF e as demais rotas não passam pela checagem do link", async () => {
    const antes = banco.rpcChamadas
    // A rota do PDF já responde 404 sozinha (testado em "revogação").
    expect((await visitar(`/r/${"x".repeat(43)}/pdf`)).status).toBe(200)
    expect((await visitar("/login")).status).toBe(200)
    expect(banco.rpcChamadas).toBe(antes)
  })

  it("o caminho do 404 não corresponde a nenhuma rota do app", () => {
    const app = path.resolve(import.meta.dirname, "../../app")
    // Segmentos da raiz, incluindo os de grupos "(app)", "(auth)".
    const raiz = readdirSync(app, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) =>
        d.name.startsWith("(")
          ? readdirSync(path.join(app, d.name), { withFileTypes: true })
              .filter((x) => x.isDirectory())
              .map((x) => x.name)
          : [d.name],
      )
    expect(raiz.filter((nome) => nome.startsWith("["))).toEqual([])
    expect(raiz).not.toContain(CAMINHO_NAO_ENCONTRADO.slice(1))
  })

  it("fora dos buscadores e sem Referer, na página e nos cabeçalhos de /r/*", async () => {
    expect(paginaPublica.metadata).toMatchObject({
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    })
    const regras = await nextConfig.headers!()
    const publica = regras.find((r) => r.source === "/r/:path*")
    expect(publica?.headers).toEqual(
      expect.arrayContaining([
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ]),
    )
  })
})

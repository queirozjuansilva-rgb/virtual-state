import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Supabase } from "./carregar-contexto"

/**
 * Estudo de terreno pela ação do servidor: terreno arquivado (dados de teste ou
 * retirado do Land Bank) é recusado mesmo com o UUID informado direto.
 */

const TERRENO = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f"

const banco = vi.hoisted(() => ({
  arquivadoEm: null as string | null,
  consultas: [] as { tabela: string; filtros: [string, unknown][] }[],
}))

/** Cliente com o encadeamento usado nas consultas; registra tabela e filtros. */
function clienteFalso(): Supabase {
  return {
    from(tabela: string) {
      const consulta = { tabela, filtros: [] as [string, unknown][] }
      banco.consultas.push(consulta)
      const cadeia = {
        select: () => cadeia,
        eq: (coluna: string, valor: unknown) => (consulta.filtros.push([coluna, valor]), cadeia),
        is: (coluna: string, valor: unknown) => (consulta.filtros.push([coluna, valor]), cadeia),
        // Como o banco: com o filtro de arquivados, terreno arquivado não volta.
        maybeSingle: async () => {
          const semArquivados = consulta.filtros.some(([c, v]) => c === "archived_at" && v === null)
          const visivel = tabela === "lands" && !(semArquivados && banco.arquivadoEm)
          return { data: visivel ? { archived_at: banco.arquivadoEm } : null, error: null }
        },
      }
      return cadeia
    },
  } as unknown as Supabase
}

vi.mock("@/lib/auth/dal", () => ({ requireUser: vi.fn(async () => ({ id: "usuario-1" })) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => clienteFalso()) }))
vi.mock("./carregar-contexto", async (original) => ({
  ...(await original<typeof import("./carregar-contexto")>()),
  carregarContexto: vi.fn(async () => null),
}))
vi.mock("./registro", () => ({ registrarExecucao: vi.fn(async () => "run-1") }))

const { estudarTerreno } = await import("./actions")
const { carregarContexto } = await import("./carregar-contexto")
const { registrarExecucao } = await import("./registro")

beforeEach(() => {
  banco.arquivadoEm = null
  banco.consultas = []
  vi.clearAllMocks()
})

describe("estudarTerreno com terreno arquivado", () => {
  it("recusa o UUID de terreno arquivado sem rodar o motor nem gravar estudo", async () => {
    banco.arquivadoEm = "2026-10-14T12:00:00Z"
    const r = await estudarTerreno({ landId: TERRENO })
    expect(r).toEqual({
      ok: false,
      erro: "Este terreno está arquivado (dados de teste ou retirado do Land Bank) e não pode ser estudado.",
    })
    expect(carregarContexto).not.toHaveBeenCalled()
    expect(registrarExecucao).not.toHaveBeenCalled()
  })

  it("terreno ativo segue para o carregamento normal", async () => {
    const r = await estudarTerreno({ landId: TERRENO, uso: "residencial_vertical" })
    expect(carregarContexto).toHaveBeenCalledOnce()
    // O carregamento falso não acha o terreno: cai na mensagem de sempre, não na de arquivado.
    expect(r).toEqual({ ok: false, erro: "Terreno não encontrado ou sem permissão de acesso." })
  })
})

describe("carregarContexto", () => {
  it("só carrega terreno não arquivado", async () => {
    const { carregarContexto: real } =
      await vi.importActual<typeof import("./carregar-contexto")>("./carregar-contexto")
    banco.arquivadoEm = "2026-10-14T12:00:00Z"
    expect(await real(clienteFalso(), TERRENO)).toBeNull()
    const lands = banco.consultas.find((c) => c.tabela === "lands")
    expect(lands?.filtros).toContainEqual(["archived_at", null])
  })
})

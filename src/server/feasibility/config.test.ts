import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { CENARIOS_PADRAO, PREMISSAS_PADRAO, RISCO_PADRAO } from "@/lib/feasibility"

import {
  CHAVES_CENARIOS,
  CHAVES_DEFAULTS,
  formaAquisicaoDoTerreno,
  montarConfig,
  type LinhaDefault,
} from "./config"

/** Lê o seed de feasibility_defaults e risk_weights da migration. */
function seedDaMigration() {
  const dir = path.resolve(import.meta.dirname, "../../../supabase/migrations")
  const arquivo = readdirSync(dir).find((f) => f.endsWith("_feasibility_seed.sql"))!
  const sql = readFileSync(path.join(dir, arquivo), "utf8")
  const defaults = new Map<string, unknown>()
  for (const m of sql.matchAll(/\('([a-z0-9_.]+)', '([^']*)', '/g)) {
    defaults.set(m[1]!, JSON.parse(m[2]!))
  }
  const pesos = new Map<string, { eixo: string; peso: number }>()
  for (const m of sql.matchAll(
    /\('([a-z_]+)', '(urbanistico|fisico|juridico|mercado)', (\d+), '/g,
  )) {
    pesos.set(m[1]!, { eixo: m[2]!, peso: Number(m[3]) })
  }
  return { defaults, pesos }
}

describe("seed do banco em sincronia com os defaults do código", () => {
  const seed = seedDaMigration()

  it("premissas", () => {
    for (const [campo, chave] of Object.entries(CHAVES_DEFAULTS)) {
      expect(seed.defaults.get(chave), chave).toEqual(
        PREMISSAS_PADRAO[campo as keyof typeof PREMISSAS_PADRAO],
      )
    }
  })

  it("cenários e limiares de risco", () => {
    for (const [chave, [cenario, campo]] of Object.entries(CHAVES_CENARIOS)) {
      expect(seed.defaults.get(chave), chave).toBe(CENARIOS_PADRAO[cenario][campo])
    }
    expect(seed.defaults.get("risco.limiar_medio")).toBe(RISCO_PADRAO.limiarMedio)
    expect(seed.defaults.get("risco.limiar_alto")).toBe(RISCO_PADRAO.limiarAlto)
  })

  it("pesos de risco", () => {
    expect(seed.pesos.size).toBe(Object.keys(RISCO_PADRAO.pesos).length)
    for (const [codigo, { eixo, peso }] of Object.entries(RISCO_PADRAO.pesos)) {
      expect(seed.pesos.get(codigo), codigo).toEqual({ eixo, peso })
    }
  })
})

describe("montarConfig", () => {
  it("usa os valores do banco e registra a origem", () => {
    const linhas: LinhaDefault[] = [
      { key: "premissa.eficiencia", value: 0.75, source: "Gabriel, 2026-11" },
      { key: "premissa.curva_obra", value: "linear", source: "Gabriel" },
      { key: "cenario.conservador.preco", value: -0.15, source: "x" },
      { key: "risco.limiar_alto", value: 60, source: "x" },
      { key: "mercado.raio_m", value: 2000, source: "x" },
    ]
    const cfg = montarConfig(linhas, [
      {
        flag_code: "matricula_ausente",
        axis: "juridico",
        weight: 30,
        label: "Sem matrícula",
        active: true,
      },
      { flag_code: "onus_registrado", axis: "juridico", weight: 15, label: "Ônus", active: false },
      { flag_code: "flag_inexistente", axis: "mercado", weight: 99, label: "?", active: true },
    ])
    expect(cfg.premissas.eficiencia).toBe(0.75)
    expect(cfg.premissas.curvaObra).toBe("linear")
    expect(cfg.premissas.fatorCub).toBe(PREMISSAS_PADRAO.fatorCub)
    expect(cfg.origens.eficiencia).toBe("Gabriel, 2026-11")
    expect(cfg.origens.fatorCub).toBeUndefined()
    expect(cfg.cenarios.conservador.preco).toBe(-0.15)
    expect(cfg.cenarios.otimista).toEqual(CENARIOS_PADRAO.otimista)
    expect(cfg.risco.limiarAlto).toBe(60)
    expect(cfg.risco.limiarMedio).toBe(RISCO_PADRAO.limiarMedio)
    expect(cfg.risco.pesos.matricula_ausente.peso).toBe(30)
    expect(cfg.risco.pesos.onus_registrado.peso).toBe(0)
    expect(cfg.mercado).toEqual({ raioM: 2000, janelaMeses: 24 })
  })

  it("ignora valores de tipo errado", () => {
    const cfg = montarConfig(
      [
        { key: "premissa.eficiencia", value: "0.7", source: "x" },
        { key: "premissa.usar_ca_maximo", value: 1, source: "x" },
        { key: "cenario.otimista.custo", value: "x", source: "x" },
      ],
      [],
    )
    expect(cfg.premissas.eficiencia).toBe(PREMISSAS_PADRAO.eficiencia)
    expect(cfg.premissas.usarCaMaximo).toBe(false)
    expect(cfg.cenarios.otimista.custo).toBe(CENARIOS_PADRAO.otimista.custo)
  })
})

describe("formaAquisicaoDoTerreno", () => {
  it("mapeia a negociação cadastrada", () => {
    expect(formaAquisicaoDoTerreno("dinheiro")).toBe("compra")
    expect(formaAquisicaoDoTerreno("permuta_fisica")).toBe("permuta_fisica")
    expect(formaAquisicaoDoTerreno("misto")).toBe("misto")
    expect(formaAquisicaoDoTerreno(null)).toBeNull()
  })
})

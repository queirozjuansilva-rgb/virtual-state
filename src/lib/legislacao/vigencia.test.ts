import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * Regressão da vigência legal no horário de Fortaleza. Roda as funções SQL da
 * migration num Postgres em memória (PGlite) com a sessão em UTC, como o banco
 * do Supabase: entre 21h e meia-noite em Fortaleza o UTC já está no dia
 * seguinte, e é aí que `current_date` errava.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations")
const MIGRATION = "20261016060000_vigencia_horario_fortaleza.sql"

function sqlDe(arquivo: string) {
  return readFileSync(path.join(MIGRATIONS, arquivo), "utf8")
}

/** Um `create [or replace] function <nome>(...) ... as $$ ... $$` tal como está na migration. */
function funcao(sql: string, nome: string) {
  const inicio = sql.search(
    new RegExp(`create (or replace )?function ${nome.replace(".", "\\.")}\\(`),
  )
  if (inicio < 0) throw new Error(`${nome} não está na migration`)
  const abre = sql.indexOf("$$", inicio)
  const fecha = sql.indexOf("$$", abre + 2)
  return `${sql.slice(inicio, fecha + 2)};`
}

/** Tipo enum tal como criado nas migrations. */
function tipo(sql: string, nome: string) {
  const m = new RegExp(`create type ${nome.replace(".", "\\.")} as enum \\([^)]*\\);`).exec(sql)
  if (!m) throw new Error(`${nome} não está na migration`)
  return m[0]
}

const FORTALEZA = "9f8e27cc-0000-4000-8000-000000000001"
const OUTRA = "9f8e27cc-0000-4000-8000-000000000002"

// Instantes em UTC e o que eles são em Fortaleza (UTC−3, sem horário de verão).
const AS_20H59 = "2026-10-14T23:59:59Z" // 14/10 20:59:59
const AS_21H = "2026-10-15T00:00:00Z" // 14/10 21:00 (UTC já é 15/10)
const AS_22H30 = "2026-10-15T01:30:00Z" // 14/10 22:30
const AS_23H59 = "2026-10-15T02:59:59Z" // 14/10 23:59:59
const MEIA_NOITE = "2026-10-15T03:00:00Z" // 15/10 00:00

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  const migracao = sqlDe(MIGRATION)
  await db.exec(`
    set TimeZone = 'UTC';
    create schema private;
    ${tipo(sqlDe("20261012010200_normative.sql"), "public.legal_document_kind")}
    ${tipo(sqlDe("20261014050000_ingestao_normativa.sql"), "public.legal_link_kind")}
    -- Só as colunas que as funções de vigência leem, com os tipos das migrations.
    create table public.legal_documents (
      id uuid primary key default gen_random_uuid(),
      municipality_id uuid not null,
      kind public.legal_document_kind not null default 'lei',
      number text not null,
      is_fictitious boolean not null default false,
      effective_from date,
      effective_until date,
      archived_at timestamptz
    );
    create table public.legal_document_links (
      from_document_id uuid not null references public.legal_documents (id),
      to_document_id uuid not null references public.legal_documents (id),
      kind public.legal_link_kind not null,
      articles text
    );
    ${funcao(migracao, "private.data_operacional")}
    ${funcao(migracao, "private.normas_vigentes")}
  `)

  const lei = async (
    numero: string,
    campos: Record<string, string | null> = {},
    municipio = FORTALEZA,
  ) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.legal_documents (municipality_id, number, effective_from, effective_until, archived_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [municipio, numero, campos.de ?? null, campos.ate ?? null, campos.arquivada ?? null],
    )
    return rows[0].id
  }
  const revoga = (de: string, para: string, artigos: string | null = null) =>
    db.query(
      `insert into public.legal_document_links (from_document_id, to_document_id, kind, articles)
       values ($1, $2, 'revoga', $3)`,
      [de, para, artigos],
    )

  await lei("amanha", { de: "2026-10-15" })
  await lei("vigente", { de: "2026-10-01" })
  await lei("ultimo-dia-hoje", { de: "2025-01-01", ate: "2026-10-14" })
  await lei("arquivada", { de: "2020-01-01", arquivada: "2026-10-01T12:00:00Z" })

  // Normas revogadoras ficam em outro município para não poluir a lista de Fortaleza.
  const revogadoraAmanha = await lei("revogadora-amanha", { de: "2026-10-15" }, OUTRA)
  const revogadoraSemData = await lei("revogadora-sem-data", {}, OUTRA)
  const revogadoraArquivada = await lei(
    "revogadora-arquivada",
    { arquivada: "2026-10-01T12:00:00Z" },
    OUTRA,
  )
  await revoga(revogadoraAmanha, await lei("revogada-a-partir-de-amanha", { de: "2020-01-01" }))
  await revoga(revogadoraSemData, await lei("revogada-sem-data", { de: "2020-01-01" }))
  await revoga(revogadoraSemData, await lei("revogada-em-parte", { de: "2020-01-01" }), "Art. 10")
  await revoga(revogadoraArquivada, await lei("revogada-por-arquivada", { de: "2020-01-01" }))
}, 30_000)

afterAll(async () => {
  await db?.close()
})

async function dataOperacional(instante: string) {
  const { rows } = await db.query<{ dia: string }>(
    "select private.data_operacional($1::timestamptz)::text as dia",
    [instante],
  )
  return rows[0].dia
}

async function vigentesEm(instante: string) {
  const { rows } = await db.query<{ number: string }>(
    `select number from private.normas_vigentes($1, private.data_operacional($2::timestamptz))
      order by number`,
    [FORTALEZA, instante],
  )
  return rows.map((r) => r.number)
}

const VIGENTES_EM_14_10 = [
  "revogada-a-partir-de-amanha",
  "revogada-em-parte",
  "revogada-por-arquivada",
  "ultimo-dia-hoje",
  "vigente",
]

describe("data operacional (America/Fortaleza)", () => {
  it("das 21h à meia-noite em Fortaleza, hoje continua sendo 14/10, embora o UTC já seja 15/10", async () => {
    for (const instante of [AS_20H59, AS_21H, AS_22H30, AS_23H59]) {
      expect(await dataOperacional(instante), instante).toBe("2026-10-14")
    }
    expect(await dataOperacional(MEIA_NOITE)).toBe("2026-10-15")

    // O que o banco (sessão em UTC) chamava de "hoje" às 22h30 em Fortaleza.
    const { rows } = await db.query<{ dia: string }>(`select $1::timestamptz::date::text as dia`, [
      AS_22H30,
    ])
    expect(rows[0].dia).toBe("2026-10-15")
  })

  it("sem argumento, usa o instante atual convertido para Fortaleza", async () => {
    const { rows } = await db.query<{ igual: boolean }>(
      "select private.data_operacional() = timezone('America/Fortaleza', now())::date as igual",
    )
    expect(rows[0].igual).toBe(true)
  })
})

describe("normas vigentes entre 21h e meia-noite em Fortaleza", () => {
  it("lei que entra em vigor amanhã não aparece como vigente hoje", async () => {
    for (const instante of [AS_21H, AS_22H30, AS_23H59]) {
      expect(await vigentesEm(instante), instante).not.toContain("amanha")
    }
    expect(await vigentesEm(MEIA_NOITE)).toContain("amanha")
  })

  it("lei vigente hoje (inclusive no último dia) continua sendo encontrada", async () => {
    for (const instante of [AS_20H59, AS_21H, AS_22H30, AS_23H59]) {
      expect(await vigentesEm(instante), instante).toEqual(VIGENTES_EM_14_10)
    }
  })

  it("revogada deixa de ser retornada no dia em que a revogação entra em vigor", async () => {
    expect(await vigentesEm(AS_23H59)).toContain("revogada-a-partir-de-amanha")
    const amanha = await vigentesEm(MEIA_NOITE)
    expect(amanha).not.toContain("revogada-a-partir-de-amanha")
    // E a vigência que terminou em 14/10 também sai à meia-noite de Fortaleza.
    expect(amanha).toEqual(["amanha", "revogada-em-parte", "revogada-por-arquivada", "vigente"])
  })

  it("revogação sem data vale desde o cadastro; parcial ou por norma arquivada não tira a lei", async () => {
    for (const instante of [AS_22H30, MEIA_NOITE]) {
      const lista = await vigentesEm(instante)
      expect(lista).not.toContain("revogada-sem-data")
      expect(lista).not.toContain("arquivada")
      expect(lista).toContain("revogada-em-parte")
      expect(lista).toContain("revogada-por-arquivada")
    }
  })
})

describe("funções do banco em vigor", () => {
  /** Última definição de cada função, na ordem das migrations. */
  function definicoesAtuais() {
    const atuais = new Map<string, string>()
    for (const arquivo of readdirSync(MIGRATIONS).sort()) {
      const sql = sqlDe(arquivo)
      for (const m of sql.matchAll(/create (?:or replace )?function ([\w.]+)\(/g)) {
        atuais.set(m[1], funcao(sql.slice(m.index), m[1]))
      }
    }
    return atuais
  }

  it("nenhuma função usa a data do fuso do banco como hoje", () => {
    for (const [nome, corpo] of definicoesAtuais()) {
      expect(corpo, nome).not.toMatch(/current_date|localtimestamp|now\(\)\s*\)?\s*::\s*date/i)
    }
  })

  it("a busca na legislação usa as normas vigentes de hoje em Fortaleza", () => {
    const busca = definicoesAtuais().get("public.buscar_texto_legal")!
    expect(busca).toContain(
      "private.normas_vigentes(p_municipality_id, private.data_operacional())",
    )
  })
})

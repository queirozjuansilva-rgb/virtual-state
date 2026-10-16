import { readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * RLS dos ajustes da auditoria (migration 20261016070000), num Postgres em
 * memória (PGlite) com o papel `authenticated` de verdade:
 * - indicadores do CPES só para administradores;
 * - relatórios de terreno fictício ou arquivado fora do alcance de usuários comuns.
 *
 * As políticas originais saem das próprias migrations antigas e a migration
 * nova roda inteira por cima: se uma política permissiva antiga sobrar, os
 * testes de usuário comum falham.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations")
const sqlDe = (arquivo: string) => readFileSync(path.join(MIGRATIONS, arquivo), "utf8")

/** Os `create policy "reports: ..."` originais (Fase 1). */
function politicasOriginaisDeRelatorios() {
  const sql = sqlDe("20261012010500_app.sql")
  const politicas = sql.match(/create policy "reports: [^"]+" on public\.reports[\s\S]*?;/g)
  if (!politicas || politicas.length !== 4) throw new Error("políticas de reports não encontradas")
  return politicas.join("\n")
}

/** O bloco que cria as políticas de cub_values, market_comparables e market_indicators. */
function politicasOriginaisDeMercado() {
  const sql = sqlDe("20261012010400_market.sql")
  const bloco = /do \$\$[\s\S]*?\$\$;/.exec(sql)
  if (!bloco) throw new Error("políticas de mercado não encontradas")
  return bloco[0]
}

const ORG = "00000000-0000-4000-8000-0000000000a1"
const MEMBRO = "00000000-0000-4000-8000-0000000000b1"
const ADMIN = "00000000-0000-4000-8000-0000000000b2"

const TERRENO_REAL = "00000000-0000-4000-8000-0000000000c1"
const TERRENO_FICTICIO = "00000000-0000-4000-8000-0000000000c2"
const TERRENO_ARQUIVADO = "00000000-0000-4000-8000-0000000000c3"

const REL_REAL = "00000000-0000-4000-8000-0000000000d1"
const REL_PONTO = "00000000-0000-4000-8000-0000000000d2"
const REL_FICTICIO = "00000000-0000-4000-8000-0000000000d3"
const REL_ARQUIVADO = "00000000-0000-4000-8000-0000000000d4"

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema private;

    -- Identidade simulada: auth.uid() e o papel de admin vêm de variáveis da sessão.
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create function private.is_admin() returns boolean language sql stable as
      $$ select coalesce(nullif(current_setting('teste.admin', true), '')::boolean, false) $$;

    create table public.memberships (user_id uuid not null, organization_id uuid not null);
    create function private.user_org_ids() returns setof uuid language sql stable security definer
      set search_path = '' as
      $$ select organization_id from public.memberships where user_id = (select auth.uid()) $$;

    create table public.lands (
      id uuid primary key,
      is_fictitious boolean not null default false,
      archived_at timestamptz
    );
    create table public.reports (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      land_id uuid references public.lands (id),
      created_by uuid,
      title text not null
    );
    create table public.report_versions (
      id uuid primary key default gen_random_uuid(),
      report_id uuid not null references public.reports (id),
      version integer not null
    );
    create type public.review_verdict as enum ('conferido', 'divergente');
    create table public.analyst_reviews (
      id uuid primary key default gen_random_uuid(),
      report_id uuid not null references public.reports (id),
      report_version_id uuid references public.report_versions (id),
      reviewer_id uuid not null,
      verdict public.review_verdict not null,
      comment text,
      created_at timestamptz not null default now()
    );
    create table public.profiles (id uuid primary key, full_name text);

    create table public.cub_values (id serial primary key);
    create table public.market_comparables (id serial primary key);
    create table public.market_indicators (
      id uuid primary key default gen_random_uuid(),
      neighborhood text,
      avg_price_m2 numeric,
      source text not null
    );

    alter table public.reports enable row level security;
    alter table public.cub_values enable row level security;
    alter table public.market_comparables enable row level security;
    alter table public.market_indicators enable row level security;

    grant usage on schema public, private, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema private, auth to authenticated;

    ${politicasOriginaisDeRelatorios()}
    ${politicasOriginaisDeMercado()}

    insert into public.memberships values ('${MEMBRO}', '${ORG}'), ('${ADMIN}', '${ORG}');
    insert into public.lands values
      ('${TERRENO_REAL}', false, null),
      ('${TERRENO_FICTICIO}', true, '2026-10-14T12:00:00Z'),
      ('${TERRENO_ARQUIVADO}', false, '2026-10-15T12:00:00Z');
    insert into public.reports (id, organization_id, land_id, created_by, title) values
      ('${REL_REAL}', '${ORG}', '${TERRENO_REAL}', '${MEMBRO}', 'Terreno real'),
      ('${REL_PONTO}', '${ORG}', null, '${MEMBRO}', 'Estudo de ponto'),
      ('${REL_FICTICIO}', '${ORG}', '${TERRENO_FICTICIO}', '${ADMIN}', 'VE-0004 (seed)'),
      ('${REL_ARQUIVADO}', '${ORG}', '${TERRENO_ARQUIVADO}', '${MEMBRO}', 'Terreno arquivado');
    insert into public.analyst_reviews (report_id, reviewer_id, verdict) values
      ('${REL_REAL}', '${ADMIN}', 'conferido'),
      ('${REL_FICTICIO}', '${ADMIN}', 'conferido');
    insert into public.market_indicators (neighborhood, avg_price_m2, source) values
      ('Meireles', 20172, 'CPES Sinduscon-CE'), (null, 11977, 'CPES Sinduscon-CE');
  `)
  // A migration nova inteira, como será aplicada no banco.
  await db.exec(sqlDe("20261016070000_cpes_admin_e_relatorios_de_teste.sql"))
}, 30_000)

afterAll(async () => {
  await db?.close()
})

/** Roda `sql` como usuário logado (papel authenticated), comum ou admin. */
async function como<T>(usuario: string, admin: boolean, sql: string, params: unknown[] = []) {
  await db.exec(
    `set role authenticated; set teste.uid = '${usuario}'; set teste.admin = '${admin}';`,
  )
  try {
    return await db.query<T>(sql, params)
  } finally {
    await db.exec("reset role; reset teste.uid; reset teste.admin;")
  }
}

const titulos = async (usuario: string, admin: boolean) =>
  (
    await como<{ title: string }>(usuario, admin, "select title from public.reports order by title")
  ).rows.map((r) => r.title)

describe("indicadores do CPES só para administradores", () => {
  it("usuário comum não consegue consultar os indicadores", async () => {
    const r = await como<{ n: number }>(
      MEMBRO,
      false,
      "select count(*)::int as n from public.market_indicators",
    )
    expect(r.rows[0].n).toBe(0)
  })

  it("administrador consegue, e os dados continuam lá", async () => {
    const r = await como<{ neighborhood: string | null }>(
      ADMIN,
      true,
      "select neighborhood from public.market_indicators order by neighborhood nulls last",
    )
    expect(r.rows.map((x) => x.neighborhood)).toEqual(["Meireles", null])
    const total = await db.query<{ n: number }>(
      "select count(*)::int as n from public.market_indicators",
    )
    expect(total.rows[0].n).toBe(2)
  })
})

describe("relatórios de dados de teste", () => {
  it("usuário comum vê só relatórios de terreno real e de ponto", async () => {
    expect(await titulos(MEMBRO, false)).toEqual(["Estudo de ponto", "Terreno real"])
  })

  it("administrador vê todos, inclusive os de terreno fictício e arquivado", async () => {
    expect(await titulos(ADMIN, true)).toEqual([
      "Estudo de ponto",
      "Terreno arquivado",
      "Terreno real",
      "VE-0004 (seed)",
    ])
  })

  it("usuário comum não altera nem apaga relatório de teste; o real continua editável", async () => {
    const editaTeste = await como(
      MEMBRO,
      false,
      "update public.reports set title = 'x' where id = $1",
      [REL_FICTICIO],
    )
    const apagaTeste = await como(MEMBRO, false, "delete from public.reports where id = $1", [
      REL_ARQUIVADO,
    ])
    expect(editaTeste.affectedRows).toBe(0)
    expect(apagaTeste.affectedRows).toBe(0)

    const editaReal = await como(
      MEMBRO,
      false,
      "update public.reports set title = title where id = $1",
      [REL_REAL],
    )
    expect(editaReal.affectedRows).toBe(1)

    const total = await db.query<{ n: number }>("select count(*)::int as n from public.reports")
    expect(total.rows[0].n).toBe(4)
  })

  it("usuário comum não cria relatório de terreno de teste", async () => {
    await expect(
      como(
        MEMBRO,
        false,
        "insert into public.reports (organization_id, land_id, created_by, title) values ($1, $2, $3, 'novo')",
        [ORG, TERRENO_FICTICIO, MEMBRO],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it("revisões de analista seguem a mesma regra", async () => {
    const revisoes = (usuario: string, admin: boolean, relatorio: string) =>
      como<{ verdict: string }>(
        usuario,
        admin,
        "select verdict from public.revisoes_do_relatorio($1)",
        [relatorio],
      ).then((r) => r.rows.length)

    expect(await revisoes(MEMBRO, false, REL_REAL)).toBe(1)
    expect(await revisoes(MEMBRO, false, REL_FICTICIO)).toBe(0)
    expect(await revisoes(ADMIN, true, REL_FICTICIO)).toBe(1)
  })
})

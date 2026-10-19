import { readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { aplicacaoAtomica, ensaio } from "../../../supabase/operacoes/ensaio.mjs"

/**
 * Trava da homologação por pendência jurídica (migration 20261019080000), num
 * Postgres em memória (PGlite) com o papel `authenticated` de verdade.
 *
 * As funções reais das migrations antigas (admin_save_zoning_rule, auditoria e
 * data operacional) são extraídas dos arquivos; a migration nova roda inteira por
 * cima, duas vezes (idempotência). Os dados existentes são fotografados antes e
 * comparados depois: a migration não pode alterar regra, fonte, norma nem vínculo.
 *
 * Também cobre a segurança da aplicação no banco compartilhado (dev = produção):
 * atomicidade (falha no último comando desfaz tudo), o ensaio usado antes de
 * aplicar (supabase/operacoes/*.ensaio.sql) e a reversão (*.reversao.sql).
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations")
const sqlDe = (arquivo: string) => readFileSync(path.join(MIGRATIONS, arquivo), "utf8")

function trecho(arquivo: string, padrao: RegExp) {
  const achado = padrao.exec(sqlDe(arquivo))
  if (!achado) throw new Error(`trecho não encontrado em ${arquivo}: ${padrao}`)
  return achado[0]
}

const MIGRATION_NOVA = sqlDe("20261019080000_pendencia_juridica_homologacao.sql")
const OPERACOES = path.resolve(import.meta.dirname, "../../../supabase/operacoes")
const REVERSAO = readFileSync(
  path.join(OPERACOES, "20261019080000_pendencia_juridica_homologacao.reversao.sql"),
  "utf8",
)
const VERIFICACAO_DO_ENSAIO = readFileSync(
  path.join(OPERACOES, "20261019080000_pendencia_juridica_homologacao.ensaio.sql"),
  "utf8",
)

const BLOQUEIO = /Homologação bloqueada — vigência sob análise jurídica/

const ADMIN = "00000000-0000-4000-8000-0000000000b2"
const MEMBRO = "00000000-0000-4000-8000-0000000000b1"

const FORTALEZA = "00000000-0000-4000-8000-00000000f001"
const PETROLINA = "00000000-0000-4000-8000-00000000f002"

// Normas de Fortaleza: as duas da pendência, alteradoras (inclusive em cadeia) e uma alheia.
const LC62 = "00000000-0000-4000-8000-0000000000e1"
const LC236 = "00000000-0000-4000-8000-0000000000e2"
const LC243 = "00000000-0000-4000-8000-0000000000e3" // altera a LC 62
const LC277 = "00000000-0000-4000-8000-0000000000e4" // altera a LC 62
const LC288 = "00000000-0000-4000-8000-0000000000e5" // altera a LC 277 (cadeia)
const DECRETO = "00000000-0000-4000-8000-0000000000e6" // sem relação com as duas
const LEI_PETROLINA = "00000000-0000-4000-8000-0000000000e7"

const ZOP1 = "00000000-0000-4000-8000-0000000000a1"
const ZONA_DA_LC62 = "00000000-0000-4000-8000-0000000000a2" // zona cuja norma é a LC 62
const ZONA_PETROLINA = "00000000-0000-4000-8000-0000000000a3"

const REGRA_ZOP1 = "00000000-0000-4000-8000-0000000000c1" // rascunho que cita a LC 62

let db: PGlite

async function comoAdmin() {
  await db.exec(
    `reset role; set teste.uid = '${ADMIN}'; set teste.admin = 'true'; set role authenticated;`,
  )
}
async function comoMembro() {
  await db.exec(
    `reset role; set teste.uid = '${MEMBRO}'; set teste.admin = 'false'; set role authenticated;`,
  )
}
async function comoSuperusuario() {
  await db.exec("reset role; set teste.uid = ''; set teste.admin = 'false';")
}

/** Chama a RPC real de gravação de regra (a mesma do painel). */
async function salvarRegra(o: {
  id?: string | null
  zona: string
  uso?: string
  fontes: string[]
  validar: boolean
}) {
  const dados = { use_type: o.uso ?? "residencial_vertical", permitted: true, ca_max: 3 }
  const campos = ["ca_max", "permitted", "ca_basico", "to_max", "gabarito_m"]
  const fontes = o.fontes.map((doc, i) => ({
    field: campos[i],
    legal_document_id: doc,
    article: "Art. 81",
  }))
  const { rows } = await db.query<{ id: string }>(
    "select public.admin_save_zoning_rule($1, $2, $3::jsonb, $4::jsonb, $5) as id",
    [o.id ?? null, o.zona, JSON.stringify(dados), JSON.stringify(fontes), o.validar],
  )
  return rows[0].id
}

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa
  } catch (e) {
    return e as { message: string; code?: string }
  }
  throw new Error("era esperado um erro")
}

async function statusDa(regra: string) {
  await comoSuperusuario()
  const { rows } = await db.query<{ status: string }>(
    "select status::text from public.zoning_rules where id = $1",
    [regra],
  )
  return rows[0]?.status
}

/** Fotografia dos dados que a migration não pode alterar. */
async function fotografia() {
  await comoSuperusuario()
  const tabela = async (sql: string) => JSON.stringify((await db.query(sql)).rows)
  return {
    regras: await tabela("select * from public.zoning_rules order by id"),
    fontes: await tabela("select * from public.rule_sources order by zoning_rule_id, field"),
    normas: await tabela("select * from public.legal_documents order by id"),
    vinculos: await tabela("select * from public.legal_document_links order by from_document_id"),
    zonas: await tabela("select * from public.zones order by id"),
  }
}

/** Objetos do banco (para provar que falha, ensaio e reversão não deixam rastro). */
async function catalogo() {
  await comoSuperusuario()
  const linhas = async (sql: string) => JSON.stringify((await db.query(sql)).rows)
  return {
    relacoes: await linhas(
      "select n.nspname, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'private') order by 1, 2",
    ),
    funcoes: await linhas(
      "select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') order by 1",
    ),
    gatilhos: await linhas(
      "select tgrelid::regclass::text as tabela, tgname from pg_trigger where not tgisinternal order by 1, 2",
    ),
    politicas: await linhas("select tablename, policyname from pg_policies order by 1, 2"),
    tipos: await linhas(
      "select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e' order by 1",
    ),
    auditoria: await linhas("select count(*) as n from public.audit_log"),
  }
}

let antes: Awaited<ReturnType<typeof fotografia>>
let catalogoAntes: Awaited<ReturnType<typeof catalogo>>
const seguranca: {
  falha?: { message: string }
  catalogoAposFalha?: Awaited<ReturnType<typeof catalogo>>
  ensaio?: { message: string; code?: string }
  adulterada?: { message: string; code?: string }
  catalogoAposAdulterada?: Awaited<ReturnType<typeof catalogo>>
  catalogoAposEnsaio?: Awaited<ReturnType<typeof catalogo>>
  dadosAposEnsaio?: Awaited<ReturnType<typeof fotografia>>
} = {}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema private;
    grant usage on schema public, private, auth to authenticated;

    create table auth.users (id uuid primary key);
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text);
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBRO}');

    -- Identidade simulada: auth.uid() e o papel de admin vêm de variáveis da sessão.
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create function private.is_admin() returns boolean language sql stable as
      $$ select coalesce(nullif(current_setting('teste.admin', true), '')::boolean, false) $$;

    create type public.legal_document_kind as enum (
      'lei', 'lei_complementar', 'decreto', 'resolucao', 'instrucao_normativa', 'outro'
    );
    create type public.land_use as enum (
      'residencial_vertical', 'residencial_horizontal', 'comercial', 'servicos', 'misto',
      'industrial', 'institucional'
    );
    create type public.rule_status as enum ('rascunho', 'validado', 'arquivado');
    create type public.legal_link_kind as enum ('altera', 'revoga', 'regulamenta', 'consolida');

    create table public.municipalities (
      id uuid primary key, ibge_code text not null unique, name text not null, uf text not null
    );
    create table public.legal_documents (
      id uuid primary key,
      municipality_id uuid not null references public.municipalities (id),
      kind public.legal_document_kind not null,
      number text not null,
      is_fictitious boolean not null default false
    );
    create table public.legal_document_links (
      id uuid primary key default gen_random_uuid(),
      from_document_id uuid not null references public.legal_documents (id),
      to_document_id uuid not null references public.legal_documents (id),
      kind public.legal_link_kind not null
    );
    create table public.zones (
      id uuid primary key,
      municipality_id uuid not null references public.municipalities (id),
      code text not null,
      legal_document_id uuid references public.legal_documents (id)
    );
    create table public.zoning_rules (
      id uuid primary key default gen_random_uuid(),
      zone_id uuid not null references public.zones (id),
      use_type public.land_use not null,
      use_label_local text, permitted boolean, ca_min numeric, ca_basico numeric, ca_max numeric,
      to_max numeric, permeabilidade_min numeric, gabarito_m numeric, gabarito_pavimentos integer,
      recuo_frontal text, recuo_lateral text, recuo_fundos text, lote_minimo_m2 numeric,
      testada_minima_m numeric, outorga_fator numeric, outorga_formula text, observacoes text,
      validation_note text,
      status public.rule_status not null default 'rascunho',
      validated_at timestamptz, validated_by uuid,
      updated_at timestamptz not null default now(),
      -- Restrição real de produção (zoning_rules_check2): validada tem data de validação.
      check (status <> 'validado' or validated_at is not null)
    );
    create table public.rule_sources (
      id uuid primary key default gen_random_uuid(),
      zoning_rule_id uuid not null references public.zoning_rules (id) on delete cascade,
      field text not null,
      legal_document_id uuid not null references public.legal_documents (id) on delete restrict,
      article text, excerpt text, page integer, condition text, resolution_note text,
      excerpt_verified boolean,
      -- Restrições reais de produção (rule_sources_field_check e _zoning_rule_id_field_key).
      check (field = any (array['permitted', 'ca_min', 'ca_basico', 'ca_max', 'to_max',
        'permeabilidade_min', 'gabarito_m', 'gabarito_pavimentos', 'recuo_frontal', 'recuo_lateral',
        'recuo_fundos', 'lote_minimo_m2', 'testada_minima_m', 'outorga_fator', 'outorga_formula'])),
      unique (zoning_rule_id, field)
    );
    -- Índice real de produção: uma única regra validada por zona e uso.
    create unique index zoning_rules_one_validated on public.zoning_rules (zone_id, use_type)
      where status = 'validado';

    ${trecho("20261012010500_app.sql", /create table public\.audit_log \([\s\S]*?\n\);/)}
    ${trecho("20261012010500_app.sql", /create function private\.audit_row\(\)[\s\S]*?\$\$;/)}
    ${trecho("20261012000000_profiles.sql", /create function public\.set_updated_at\(\)[\s\S]*?\$\$;/)}
    ${trecho("20261016060000_vigencia_horario_fortaleza.sql", /create or replace function private\.data_operacional\([\s\S]*?\$\$;/)}
    ${trecho("20261014050000_ingestao_normativa.sql", /create or replace function public\.admin_save_zoning_rule\([\s\S]*?\$\$;/)}

    -- Como no Supabase: tabelas novas do schema public já nascem com privilégios
    -- para authenticated; quem decide o acesso é a RLS.
    grant select, insert, update, delete on all tables in schema public to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

    insert into public.municipalities values
      ('${FORTALEZA}', '2304400', 'Fortaleza', 'CE'),
      ('${PETROLINA}', '2611101', 'Petrolina', 'PE');
    insert into public.legal_documents (id, municipality_id, kind, number) values
      ('${LC62}', '${FORTALEZA}', 'lei_complementar', '62/2009'),
      ('${LC236}', '${FORTALEZA}', 'lei_complementar', '236/2017'),
      ('${LC243}', '${FORTALEZA}', 'lei_complementar', '243/2017'),
      ('${LC277}', '${FORTALEZA}', 'lei_complementar', '277/2019'),
      ('${LC288}', '${FORTALEZA}', 'lei_complementar', '288/2020'),
      ('${DECRETO}', '${FORTALEZA}', 'decreto', '99/2026'),
      ('${LEI_PETROLINA}', '${PETROLINA}', 'lei_complementar', '62/2009');
    insert into public.legal_document_links (from_document_id, to_document_id, kind) values
      ('${LC243}', '${LC62}', 'altera'),
      ('${LC277}', '${LC62}', 'altera'),
      ('${LC288}', '${LC277}', 'altera'),
      ('${LC236}', '${LC62}', 'regulamenta');
    insert into public.zones (id, municipality_id, code, legal_document_id) values
      ('${ZOP1}', '${FORTALEZA}', 'ZOP 1', null),
      ('${ZONA_DA_LC62}', '${FORTALEZA}', 'ZOM 1', '${LC62}'),
      ('${ZONA_PETROLINA}', '${PETROLINA}', 'ZR', null);
    insert into public.zoning_rules (id, zone_id, use_type, ca_max, status) values
      ('${REGRA_ZOP1}', '${ZOP1}', 'residencial_vertical', 3, 'rascunho');
    insert into public.rule_sources (zoning_rule_id, field, legal_document_id, article) values
      ('${REGRA_ZOP1}', 'ca_max', '${LC62}', 'Art. 81, II'),
      ('${REGRA_ZOP1}', 'permitted', '${LC62}', 'Art. 82');
  `)

  antes = await fotografia()
  catalogoAntes = await catalogo()

  // Segurança, antes de aplicar de verdade: (1) erro no último comando desfaz a
  // migration inteira; (2) o ensaio confere tudo e não deixa rastro.
  seguranca.falha = await erroDe(db.exec(`${MIGRATION_NOVA}\nselect 1 / 0;`))
  seguranca.catalogoAposFalha = await catalogo()
  seguranca.ensaio = await erroDe(db.exec(ensaio(MIGRATION_NOVA, VERIFICACAO_DO_ENSAIO)))
  seguranca.catalogoAposEnsaio = await catalogo()
  seguranca.dadosAposEnsaio = await fotografia()
  // (3) Texto alterado no caminho (um caractere da migration) não é executado.
  const adulterada = aplicacaoAtomica(MIGRATION_NOVA).replace(
    "'vigencia-lc-450-2025'",
    "'vigencia-lc-450-2O25'",
  )
  seguranca.adulterada = await erroDe(db.exec(adulterada))
  seguranca.catalogoAposAdulterada = await catalogo()

  // Como será aplicada (um único comando) e de novo, crua (idempotência).
  await db.exec(aplicacaoAtomica(MIGRATION_NOVA))
  await db.exec(MIGRATION_NOVA)
  // O MCP do Supabase registra a migration aplicada pelo nome.
  await db.exec(
    "insert into supabase_migrations.schema_migrations values ('20261019120000', 'pendencia_juridica_homologacao')",
  )
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe("segurança da aplicação", () => {
  it("confere o md5: texto da migration alterado no caminho não executa nada", () => {
    expect(seguranca.adulterada?.code).toBe("ENS02")
    expect(seguranca.adulterada?.message).toMatch(/difere do arquivo/)
    expect(seguranca.catalogoAposAdulterada).toEqual(catalogoAntes)
  })

  it("é atômica: erro no último comando desfaz a migration inteira", () => {
    expect(seguranca.falha?.message).toMatch(/division by zero/)
    expect(seguranca.catalogoAposFalha).toEqual(catalogoAntes)
  })

  it("o ensaio confere pendência, alcance e trava com os dados, e não grava nada", () => {
    expect(seguranca.ensaio?.code).toBe("ENS01")
    expect(seguranca.ensaio?.message).toBe(
      "ENSAIO CONCLUÍDO, NADA FOI GRAVADO: pendencias=1; normas_ligadas=2; normas_no_alcance=5; " +
        "regras_alcancadas=1; gatilhos_trava=2; politicas=2; validacao_de_teste=bloqueou ZOP 1",
    )
    expect(seguranca.catalogoAposEnsaio).toEqual(catalogoAntes)
    expect(seguranca.dadosAposEnsaio).toEqual(antes)
  })
})

describe("migration", () => {
  it("não altera regras, fontes, normas, vínculos nem zonas existentes", async () => {
    expect(await fotografia()).toEqual(antes)
  })

  it("registra uma única pendência de Fortaleza, aberta, ligada à LC 62/2009 e à LC 236/2017", async () => {
    await comoSuperusuario()
    const { rows } = await db.query<{ code: string; status: string; municipality_id: string }>(
      "select code, status::text, municipality_id from public.legal_pendencies",
    )
    expect(rows).toEqual([
      { code: "vigencia-lc-450-2025", status: "aberta", municipality_id: FORTALEZA },
    ])
    const docs = await db.query<{ legal_document_id: string }>(
      "select legal_document_id from public.legal_pendency_documents order by legal_document_id",
    )
    expect(docs.rows.map((d) => d.legal_document_id)).toEqual([LC62, LC236])
  })

  it("norma ou município em análise não podem ser excluídos com a pendência ativa", async () => {
    await comoSuperusuario()
    const { rows } = await db.query<{ conname: string; confdeltype: string }>(
      "select conname, confdeltype from pg_constraint where conname in ('legal_pendencies_municipality_id_fkey', 'legal_pendency_documents_legal_document_id_fkey') order by 1",
    )
    expect(rows).toEqual([
      { conname: "legal_pendencies_municipality_id_fkey", confdeltype: "r" },
      { conname: "legal_pendency_documents_legal_document_id_fkey", confdeltype: "r" },
    ])
  })

  it("mede o alcance: 2 normas diretas, 3 relacionadas (inclusive em cadeia)", async () => {
    await comoAdmin()
    const { rows } = await db.query<{
      normas_diretas: number
      normas_relacionadas: number
      regras: number
    }>(
      "select * from public.alcance_da_pendencia_juridica((select id from public.legal_pendencies))",
    )
    expect(rows[0]).toMatchObject({ normas_diretas: 2, normas_relacionadas: 3 })
    expect(rows[0].regras).toBeGreaterThanOrEqual(1)
  })
})

describe("trava da homologação", () => {
  it("deixa salvar como rascunho uma regra que cita a LC 62/2009", async () => {
    await comoAdmin()
    await salvarRegra({ id: REGRA_ZOP1, zona: ZOP1, fontes: [LC62, LC62], validar: false })
    expect(await statusDa(REGRA_ZOP1)).toBe("rascunho")
  })

  it("bloqueia a validação da regra da ZOP 1 e mantém o rascunho como estava", async () => {
    await comoAdmin()
    const erro = await erroDe(
      salvarRegra({ id: REGRA_ZOP1, zona: ZOP1, fontes: [LC62], validar: true }),
    )
    expect(erro.message).toMatch(BLOQUEIO)
    expect(erro.code).toBe("VEJ01")
    expect(await statusDa(REGRA_ZOP1)).toBe("rascunho")
    const fontes = await db.query("select 1 from public.rule_sources where zoning_rule_id = $1", [
      REGRA_ZOP1,
    ])
    expect(fontes.rows).toHaveLength(2) // a regravação das fontes também foi desfeita
  })

  it.each([
    ["a LC 236/2017", LC236],
    ["uma lei que altera a LC 62/2009", LC243],
    ["uma lei que altera outra alteradora (cadeia)", LC288],
  ])("bloqueia regra que cita %s", async (_, doc) => {
    await comoAdmin()
    const erro = await erroDe(
      salvarRegra({ zona: ZOP1, uso: "misto", fontes: [DECRETO, doc], validar: true }),
    )
    expect(erro.message).toMatch(BLOQUEIO)
  })

  it("bloqueia regra de zona cuja norma é a LC 62/2009, mesmo citando outra norma", async () => {
    await comoAdmin()
    const erro = await erroDe(salvarRegra({ zona: ZONA_DA_LC62, fontes: [DECRETO], validar: true }))
    expect(erro.message).toMatch(BLOQUEIO)
  })

  it("não bloqueia regra de Fortaleza que só cita norma fora do alcance", async () => {
    await comoAdmin()
    const id = await salvarRegra({ zona: ZOP1, uso: "comercial", fontes: [DECRETO], validar: true })
    expect(await statusDa(id)).toBe("validado")
  })

  it("não bloqueia regra de outro município", async () => {
    await comoAdmin()
    const id = await salvarRegra({ zona: ZONA_PETROLINA, fontes: [LEI_PETROLINA], validar: true })
    expect(await statusDa(id)).toBe("validado")
  })

  it("desfaz tudo se a nova validação for bloqueada: a regra validada anterior continua validada", async () => {
    await comoAdmin()
    const anterior = await salvarRegra({
      zona: ZOP1,
      uso: "servicos",
      fontes: [DECRETO],
      validar: true,
    })
    const erro = await erroDe(
      salvarRegra({ zona: ZOP1, uso: "servicos", fontes: [LC62], validar: true }),
    )
    expect(erro.message).toMatch(BLOQUEIO)
    expect(await statusDa(anterior)).toBe("validado")
  })

  it("bloqueia validação por escrita direta na tabela", async () => {
    await comoAdmin()
    const erro = await erroDe(
      db.query(
        "update public.zoning_rules set status = 'validado', validated_at = now() where id = $1",
        [REGRA_ZOP1],
      ),
    )
    expect(erro.message).toMatch(BLOQUEIO)
    expect(await statusDa(REGRA_ZOP1)).toBe("rascunho")
  })

  it("bloqueia incluir fonte da LC 62/2009 numa regra já validada", async () => {
    await comoAdmin()
    const id = await salvarRegra({
      zona: ZOP1,
      uso: "institucional",
      fontes: [DECRETO],
      validar: true,
    })
    const erro = await erroDe(
      db.query(
        "insert into public.rule_sources (zoning_rule_id, field, legal_document_id, article) values ($1, 'ca_basico', $2, 'Art. 81, I')",
        [id, LC62],
      ),
    )
    expect(erro.message).toMatch(BLOQUEIO)
  })

  it("arquivar uma regra continua livre", async () => {
    await comoAdmin()
    const id = await salvarRegra({
      zona: ZOP1,
      uso: "industrial",
      fontes: [DECRETO],
      validar: true,
    })
    await db.query("update public.zoning_rules set status = 'arquivado' where id = $1", [id])
    expect(await statusDa(id)).toBe("arquivado")
  })
})

describe("consultas do painel", () => {
  it("bloqueio_juridico aponta a pendência para fontes no alcance e nada fora dele", async () => {
    await comoAdmin()
    const pendencia = (await db.query<{ id: string }>("select id from public.legal_pendencies"))
      .rows[0].id
    const bloqueada = await db.query("select id, title from public.bloqueio_juridico($1, $2)", [
      ZOP1,
      [LC62],
    ])
    expect(bloqueada.rows).toEqual([
      { id: pendencia, title: "Vigência da LC nº 450/2025 e efeitos da LC nº 461/2026" },
    ])
    const livre = await db.query("select id from public.bloqueio_juridico($1, $2)", [
      ZOP1,
      [DECRETO],
    ])
    expect(livre.rows).toEqual([])
  })

  it("regras_com_bloqueio_juridico lista só as regras alcançadas", async () => {
    await comoAdmin()
    const livre = await salvarRegra({
      zona: ZOP1,
      uso: "residencial_horizontal",
      fontes: [DECRETO],
      validar: false,
    })
    const { rows } = await db.query<{ rule_id: string }>(
      "select rule_id from public.regras_com_bloqueio_juridico($1)",
      [[REGRA_ZOP1, livre]],
    )
    expect(rows.map((r) => r.rule_id)).toEqual([REGRA_ZOP1])
  })

  it("usuário comum não recebe nada das consultas do painel", async () => {
    await comoMembro()
    expect(
      (await db.query("select * from public.bloqueio_juridico($1, $2)", [ZOP1, [LC62]])).rows,
    ).toEqual([])
    expect(
      (await db.query("select * from public.regras_com_bloqueio_juridico($1)", [[REGRA_ZOP1]]))
        .rows,
    ).toEqual([])
  })
})

describe("RLS das pendências", () => {
  it("usuário comum lê a pendência aberta e as normas ligadas, mas não escreve", async () => {
    await comoMembro()
    expect((await db.query("select id from public.legal_pendencies")).rows).toHaveLength(1)
    expect((await db.query("select * from public.legal_pendency_documents")).rows).toHaveLength(2)
    const atualizadas = await db.query("update public.legal_pendencies set status = 'resolvida'")
    expect(atualizadas.affectedRows).toBe(0)
    const erro = await erroDe(
      db.query(
        "insert into public.legal_pendencies (code, municipality_id, title, description) values ('x-y-z', $1, 'Teste', 'Teste')",
        [FORTALEZA],
      ),
    )
    expect(erro.message).toMatch(/row-level security/)
  })

  it("nem administrador encerra a pendência por escrita direta", async () => {
    await comoAdmin()
    const atualizadas = await db.query(
      "update public.legal_pendencies set status = 'resolvida', resolved_at = now(), opinion_summary = 'Conclusão qualquer', opinion_author = 'Fulano', opinion_date = '2026-10-01'",
    )
    expect(atualizadas.affectedRows).toBe(0)
  })

  it("o banco recusa encerramento sem parecer, responsável e data", async () => {
    await comoSuperusuario()
    const erro = await erroDe(
      db.query("update public.legal_pendencies set status = 'resolvida', resolved_at = now()"),
    )
    expect(erro.message).toMatch(/legal_pendencies_encerramento_completo/)
  })
})

describe("desbloqueio", () => {
  const resolver = (parecer: string | null, responsavel: string | null, data: string | null) =>
    db.query(
      "select public.admin_resolver_pendencia_juridica((select id from public.legal_pendencies), $1, $2, $3::date, $4)",
      [parecer, responsavel, data, "Parecer nº 12/2026"],
    )

  it("só administrador desbloqueia", async () => {
    await comoMembro()
    const erro = await erroDe(
      resolver("Conclusão do parecer jurídico.", "Fulana, OAB/CE 0000", "2026-10-01"),
    )
    expect(erro.code).toBe("42501")
  })

  it.each([
    ["sem parecer", null, "Fulana, OAB/CE 0000", "2026-10-01", /conclusão do parecer/],
    ["sem responsável", "Conclusão do parecer jurídico.", "  ", "2026-10-01", /responsável/],
    ["sem data", "Conclusão do parecer jurídico.", "Fulana, OAB/CE 0000", null, /data do parecer/],
    [
      "com data futura",
      "Conclusão do parecer jurídico.",
      "Fulana, OAB/CE 0000",
      "2999-01-01",
      /futura/,
    ],
  ])("recusa %s", async (_, parecer, responsavel, data, mensagem) => {
    await comoAdmin()
    const erro = await erroDe(resolver(parecer, responsavel, data))
    expect(erro.message).toMatch(mensagem)
    await comoSuperusuario()
    const { rows } = await db.query<{ status: string }>(
      "select status::text from public.legal_pendencies",
    )
    expect(rows[0].status).toBe("aberta")
  })

  it("com parecer, responsável e data, encerra, audita e libera a validação", async () => {
    await comoAdmin()
    await resolver("Conclusão do parecer jurídico.", "Fulana de Tal, OAB/CE 0000", "2026-10-01")

    await comoSuperusuario()
    const { rows } = await db.query<Record<string, unknown>>(
      "select status::text, opinion_author, opinion_date::text, opinion_reference, resolved_by from public.legal_pendencies",
    )
    expect(rows[0]).toEqual({
      status: "resolvida",
      opinion_author: "Fulana de Tal, OAB/CE 0000",
      opinion_date: "2026-10-01",
      opinion_reference: "Parecer nº 12/2026",
      resolved_by: ADMIN,
    })
    const auditoria = await db.query(
      "select 1 from public.audit_log where entity = 'legal_pendencies' and action = 'UPDATE' and actor_id = $1",
      [ADMIN],
    )
    expect(auditoria.rows).toHaveLength(1)

    await comoAdmin()
    await salvarRegra({ id: REGRA_ZOP1, zona: ZOP1, fontes: [LC62], validar: true })
    expect(await statusDa(REGRA_ZOP1)).toBe("validado")
  })

  it("pendência encerrada não pode ser encerrada de novo e some para usuário comum", async () => {
    await comoAdmin()
    const erro = await erroDe(
      resolver("Outra conclusão qualquer.", "Beltrano, OAB/CE 1111", "2026-10-02"),
    )
    expect(erro.message).toMatch(/já foi encerrada/)
    await comoMembro()
    expect((await db.query("select id from public.legal_pendencies")).rows).toHaveLength(0)
  })
})

describe("reversão", () => {
  it("remove só o que a migration criou, mantém dados e auditoria e pode rodar de novo", async () => {
    const dadosAntes = await fotografia()
    await comoSuperusuario()
    const auditoriaAntes = (await db.query("select count(*)::int as n from public.audit_log")).rows

    await db.exec(REVERSAO)
    await db.exec(REVERSAO)

    const depois = await catalogo()
    expect({ ...depois, auditoria: null }).toEqual({ ...catalogoAntes, auditoria: null })
    expect(await fotografia()).toEqual(dadosAntes)
    await comoSuperusuario()
    expect((await db.query("select count(*)::int as n from public.audit_log")).rows).toEqual(
      auditoriaAntes,
    )
    const registro = await db.query("select 1 from supabase_migrations.schema_migrations")
    expect(registro.rows).toEqual([])
  })
})

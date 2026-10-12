-- Fase 1: base normativa genérica (motor de regras por município).
-- Nenhum município vem no código: tudo entra como dado.

create type public.coverage_status as enum ('sem_cobertura', 'em_implantacao', 'coberto');
create type public.legal_document_kind as enum (
  'lei', 'lei_complementar', 'decreto', 'resolucao', 'instrucao_normativa', 'outro'
);
create type public.zone_kind as enum ('zona', 'macrozona', 'zeis', 'zona_especial', 'outro');
create type public.land_use as enum (
  'residencial_vertical', 'residencial_horizontal', 'comercial', 'servicos', 'misto',
  'industrial', 'institucional'
);
create type public.rule_status as enum ('rascunho', 'validado', 'arquivado');
create type public.environmental_layer_kind as enum (
  'app', 'area_alagavel', 'zona_protecao_ambiental', 'faixa_nao_edificavel', 'faixa_dominio',
  'tombamento', 'outro'
);

-- Municípios -------------------------------------------------------------------

create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  ibge_code char(7) not null unique check (ibge_code ~ '^[0-9]{7}$'),
  name text not null,
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  coverage_status public.coverage_status not null default 'sem_cobertura',
  center extensions.geometry(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger municipalities_set_updated_at
  before update on public.municipalities
  for each row execute function public.set_updated_at();

-- Documentos legais ------------------------------------------------------------

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  kind public.legal_document_kind not null,
  number text not null,
  title text not null,
  published_on date,
  effective_from date,
  effective_until date,
  official_url text check (official_url is null or official_url ~ '^https?://'),
  storage_path text,
  -- Marca documentos de teste (seed). Nunca devem ir para relatório real.
  is_fictitious boolean not null default false,
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_from is null or effective_from <= effective_until)
);

create index legal_documents_municipality_idx on public.legal_documents (municipality_id);

create trigger legal_documents_set_updated_at
  before update on public.legal_documents
  for each row execute function public.set_updated_at();

-- Trechos de lei para RAG (Fase 5). Embedding de 1024 dimensões (Voyage, ADR futura).
create table public.legal_chunks (
  id uuid primary key default gen_random_uuid(),
  legal_document_id uuid not null references public.legal_documents (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  article text,
  content text not null,
  embedding extensions.vector(1024),
  tsv tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at timestamptz not null default now(),
  unique (legal_document_id, chunk_index)
);

create index legal_chunks_embedding_idx on public.legal_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index legal_chunks_tsv_idx on public.legal_chunks using gin (tsv);

-- Zonas ------------------------------------------------------------------------

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 40),
  name text not null,
  kind public.zone_kind not null default 'zona',
  description text,
  -- Opcional: sem geometria, a zona só pode ser atribuída manualmente ao lote.
  geom extensions.geometry(MultiPolygon, 4326) check (geom is null or extensions.st_isvalid(geom)),
  geojson jsonb generated always as (extensions.st_asgeojson(geom, 7)::jsonb) stored,
  legal_document_id uuid references public.legal_documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, code)
);

create index zones_geom_idx on public.zones using gist (geom);

create trigger zones_set_updated_at
  before update on public.zones
  for each row execute function public.set_updated_at();

-- Regras urbanísticas (zona × uso) ----------------------------------------------
-- Frações (TO, permeabilidade) em 0–1. Recuos são expressões da DSL segura
-- (src/lib/formula), ex.: '5' ou 'max(H/10, 3)'. Nunca avaliadas com eval.

create table public.zoning_rules (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones (id) on delete cascade,
  use_type public.land_use not null,
  use_label_local text,
  permitted boolean not null default true,
  ca_min numeric(6, 3) check (ca_min >= 0),
  ca_basico numeric(6, 3) check (ca_basico >= 0),
  ca_max numeric(6, 3) check (ca_max >= 0),
  to_max numeric(5, 4) check (to_max between 0 and 1),
  permeabilidade_min numeric(5, 4) check (permeabilidade_min between 0 and 1),
  gabarito_m numeric(7, 2) check (gabarito_m > 0),
  gabarito_pavimentos integer check (gabarito_pavimentos > 0),
  recuo_frontal text check (length(recuo_frontal) <= 200),
  recuo_lateral text check (length(recuo_lateral) <= 200),
  recuo_fundos text check (length(recuo_fundos) <= 200),
  lote_minimo_m2 numeric(12, 2) check (lote_minimo_m2 > 0),
  testada_minima_m numeric(8, 2) check (testada_minima_m > 0),
  outorga_fator numeric(8, 4) check (outorga_fator >= 0),
  outorga_formula text check (length(outorga_formula) <= 300),
  observacoes text,
  status public.rule_status not null default 'rascunho',
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ca_min is null or ca_basico is null or ca_min <= ca_basico),
  check (ca_basico is null or ca_max is null or ca_basico <= ca_max),
  check (status <> 'validado' or (validated_at is not null))
);

-- Só uma regra validada por zona × uso. Rascunhos podem coexistir.
create unique index zoning_rules_one_validated
  on public.zoning_rules (zone_id, use_type) where status = 'validado';
create index zoning_rules_zone_idx on public.zoning_rules (zone_id);

create trigger zoning_rules_set_updated_at
  before update on public.zoning_rules
  for each row execute function public.set_updated_at();

-- Fonte de cada campo da regra (lei + artigo + trecho citado).
create table public.rule_sources (
  id uuid primary key default gen_random_uuid(),
  zoning_rule_id uuid not null references public.zoning_rules (id) on delete cascade,
  field text not null check (field in (
    'permitted', 'ca_min', 'ca_basico', 'ca_max', 'to_max', 'permeabilidade_min',
    'gabarito_m', 'gabarito_pavimentos', 'recuo_frontal', 'recuo_lateral', 'recuo_fundos',
    'lote_minimo_m2', 'testada_minima_m', 'outorga_fator', 'outorga_formula'
  )),
  legal_document_id uuid not null references public.legal_documents (id) on delete restrict,
  article text not null,
  excerpt text,
  created_at timestamptz not null default now(),
  unique (zoning_rule_id, field)
);

create index rule_sources_document_idx on public.rule_sources (legal_document_id);

-- Camadas ambientais / restrições ----------------------------------------------

create table public.environmental_layers (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  kind public.environmental_layer_kind not null,
  name text not null,
  source text not null,
  legal_document_id uuid references public.legal_documents (id) on delete set null,
  geom extensions.geometry(MultiPolygon, 4326) not null check (extensions.st_isvalid(geom)),
  geojson jsonb generated always as (extensions.st_asgeojson(geom, 7)::jsonb) stored,
  is_fictitious boolean not null default false,
  created_at timestamptz not null default now()
);

create index environmental_layers_geom_idx on public.environmental_layers using gist (geom);
create index environmental_layers_municipality_idx on public.environmental_layers (municipality_id);

-- RLS: leitura para usuários logados, escrita só admin ------------------------

alter table public.municipalities enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_chunks enable row level security;
alter table public.zones enable row level security;
alter table public.zoning_rules enable row level security;
alter table public.rule_sources enable row level security;
alter table public.environmental_layers enable row level security;

-- Leitura liberada para usuários logados; escrita só admin, com uma política por
-- ação (evita políticas permissivas duplicadas no SELECT).
do $$
declare
  t text;
begin
  foreach t in array array[
    'municipalities', 'legal_documents', 'legal_chunks', 'zones', 'environmental_layers'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)',
      t || ': leitura', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      t || ': admin insere', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || ': admin atualiza', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      t || ': admin remove', t);
  end loop;
end;
$$;

-- Princípio 2: fora do admin, só regras validadas são visíveis.
create policy "zoning_rules: leitura de validadas; admin vê todas" on public.zoning_rules
  for select to authenticated
  using (status = 'validado' or (select private.is_admin()));
create policy "zoning_rules: admin insere" on public.zoning_rules
  for insert to authenticated with check ((select private.is_admin()));
create policy "zoning_rules: admin atualiza" on public.zoning_rules
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "zoning_rules: admin remove" on public.zoning_rules
  for delete to authenticated using ((select private.is_admin()));

create policy "rule_sources: leitura conforme a regra" on public.rule_sources
  for select to authenticated
  using (
    exists (
      select 1 from public.zoning_rules r
      where r.id = zoning_rule_id and (r.status = 'validado' or (select private.is_admin()))
    )
  );
create policy "rule_sources: admin insere" on public.rule_sources
  for insert to authenticated with check ((select private.is_admin()));
create policy "rule_sources: admin atualiza" on public.rule_sources
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "rule_sources: admin remove" on public.rule_sources
  for delete to authenticated using ((select private.is_admin()));

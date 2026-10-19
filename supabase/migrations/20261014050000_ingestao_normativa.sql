-- Fase 5: ingestão normativa (ADR 0011).
-- PDF da lei → páginas (texto ou OCR) → trechos (RAG) → extração assistida →
-- rascunho de regra → revisão e homologação por pessoa. A IA nunca valida.

-- Documento legal: arquivo, coleta, direito de uso e andamento da ingestão -------

create type public.ingestion_status as enum (
  'sem_arquivo', 'enviado', 'paginas', 'fragmentado', 'indexado', 'erro'
);

alter table public.legal_documents
  add column file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  add column file_size_bytes bigint check (file_size_bytes > 0),
  add column page_count integer check (page_count > 0),
  -- Data em que o arquivo foi obtido. Diferente da vigência: uma lei coletada
  -- hoje pode reger um período anterior (Blueprint v2.2, p. 17).
  add column collected_at date,
  add column usage_rights text check (length(usage_rights) <= 300),
  add column ingestion_status public.ingestion_status not null default 'sem_arquivo',
  add column ingestion_error text,
  add column ingestion_updated_at timestamptz;

-- Páginas: texto extraído do PDF ou transcrito por OCR -------------------------

create type public.page_text_method as enum ('texto', 'ocr', 'pendente');

create table public.legal_document_pages (
  legal_document_id uuid not null references public.legal_documents (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  method public.page_text_method not null,
  content text not null default '',
  ocr_model text,
  updated_at timestamptz not null default now(),
  primary key (legal_document_id, page_number)
);

alter table public.legal_chunks
  add column page_start integer check (page_start >= 1),
  add column page_end integer check (page_end >= 1),
  add column embedding_model text,
  add constraint legal_chunks_paginas check (page_end is null or page_start <= page_end);

-- Relações entre normas: a lei nova altera, revoga, regulamenta ou consolida outra.
create type public.legal_link_kind as enum ('altera', 'revoga', 'regulamenta', 'consolida');

create table public.legal_document_links (
  id uuid primary key default gen_random_uuid(),
  from_document_id uuid not null references public.legal_documents (id) on delete cascade,
  to_document_id uuid not null references public.legal_documents (id) on delete cascade,
  kind public.legal_link_kind not null,
  -- Artigos afetados, quando conhecidos (ex.: "Art. 81, Art. 82").
  articles text check (length(articles) <= 500),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (from_document_id, to_document_id, kind),
  check (from_document_id <> to_document_id)
);

create index legal_document_links_to_idx on public.legal_document_links (to_document_id);

-- Extração assistida -------------------------------------------------------------

create type public.extraction_status as enum ('em_andamento', 'concluida', 'erro');

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  legal_document_id uuid not null references public.legal_documents (id) on delete cascade,
  pages integer[] not null check (cardinality(pages) between 1 and 200),
  target_use public.land_use not null,
  instructions text check (length(instructions) <= 2000),
  model text not null,
  prompt_version text not null,
  status public.extraction_status not null default 'em_andamento',
  output jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 4),
  error text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index extraction_runs_document_idx on public.extraction_runs (legal_document_id);
create index extraction_runs_created_by_idx on public.extraction_runs (created_by);

-- Regra: vínculo com a extração, valores sugeridos pela IA e homologação ----------

alter table public.zoning_rules
  add column extraction_run_id uuid references public.extraction_runs (id) on delete set null,
  -- Valores que a IA sugeriu, por campo. Na validação, comparar com os
  -- validados mede a taxa de acerto da extração (calibração).
  add column extracted_values jsonb,
  -- Nota de homologação: quem conferiu e com base em quê (Blueprint v2.2, p. 22).
  add column validation_note text check (length(validation_note) <= 2000);

create index zoning_rules_extraction_idx on public.zoning_rules (extraction_run_id);

alter table public.rule_sources
  add column page integer check (page >= 1),
  -- Condição ou exceção do parâmetro (ex.: "para lotes acima de 1.000 m²").
  add column condition text check (length(condition) <= 500),
  -- Resolução documentada quando a fonte diverge de outra norma (conflito).
  add column resolution_note text check (length(resolution_note) <= 1000),
  -- O trecho citado foi localizado no texto da página (conferência automática).
  add column excerpt_verified boolean;

-- RLS ------------------------------------------------------------------------------

alter table public.legal_document_pages enable row level security;
alter table public.legal_document_links enable row level security;
alter table public.extraction_runs enable row level security;

-- Texto de lei é público: leitura para usuários logados, escrita só admin.
create policy "legal_document_pages: leitura" on public.legal_document_pages
  for select to authenticated using (true);
create policy "legal_document_pages: admin insere" on public.legal_document_pages
  for insert to authenticated with check ((select private.is_admin()));
create policy "legal_document_pages: admin atualiza" on public.legal_document_pages
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "legal_document_pages: admin remove" on public.legal_document_pages
  for delete to authenticated using ((select private.is_admin()));

create policy "legal_document_links: leitura" on public.legal_document_links
  for select to authenticated using (true);
create policy "legal_document_links: admin insere" on public.legal_document_links
  for insert to authenticated with check ((select private.is_admin()));
create policy "legal_document_links: admin atualiza" on public.legal_document_links
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "legal_document_links: admin remove" on public.legal_document_links
  for delete to authenticated using ((select private.is_admin()));

-- Execuções de extração: só admin (têm custo e saída bruta do modelo).
create policy "extraction_runs: admin lê" on public.extraction_runs
  for select to authenticated using ((select private.is_admin()));
create policy "extraction_runs: admin insere" on public.extraction_runs
  for insert to authenticated with check ((select private.is_admin()));
create policy "extraction_runs: admin atualiza" on public.extraction_runs
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "extraction_runs: admin remove" on public.extraction_runs
  for delete to authenticated using ((select private.is_admin()));

-- Salvar regra: fonte com página, condição e resolução; nota de homologação --------

create or replace function public.admin_save_zoning_rule(
  p_id uuid,
  p_zone_id uuid,
  p_data jsonb,
  p_sources jsonb,
  p_validate boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_use public.land_use := (p_data ->> 'use_type')::public.land_use;
  v_status public.rule_status := case when p_validate then 'validado' else 'rascunho' end;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  -- Uma nova validação substitui a anterior, que fica arquivada (histórico).
  if p_validate then
    update public.zoning_rules
       set status = 'arquivado'
     where zone_id = p_zone_id and use_type = v_use and status = 'validado'
       and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.zoning_rules (zone_id, use_type, status) values (p_zone_id, v_use, 'rascunho')
    returning id into v_id;
  else
    v_id := p_id;
  end if;

  update public.zoning_rules
     set use_type = v_use,
         use_label_local = p_data ->> 'use_label_local',
         permitted = (p_data ->> 'permitted')::boolean,
         ca_min = (p_data ->> 'ca_min')::numeric,
         ca_basico = (p_data ->> 'ca_basico')::numeric,
         ca_max = (p_data ->> 'ca_max')::numeric,
         to_max = (p_data ->> 'to_max')::numeric,
         permeabilidade_min = (p_data ->> 'permeabilidade_min')::numeric,
         gabarito_m = (p_data ->> 'gabarito_m')::numeric,
         gabarito_pavimentos = (p_data ->> 'gabarito_pavimentos')::integer,
         recuo_frontal = p_data ->> 'recuo_frontal',
         recuo_lateral = p_data ->> 'recuo_lateral',
         recuo_fundos = p_data ->> 'recuo_fundos',
         lote_minimo_m2 = (p_data ->> 'lote_minimo_m2')::numeric,
         testada_minima_m = (p_data ->> 'testada_minima_m')::numeric,
         outorga_fator = (p_data ->> 'outorga_fator')::numeric,
         outorga_formula = p_data ->> 'outorga_formula',
         observacoes = p_data ->> 'observacoes',
         validation_note = nullif(p_data ->> 'validation_note', ''),
         status = v_status,
         validated_at = case when p_validate then now() else null end,
         validated_by = case when p_validate then (select auth.uid()) else null end
   where id = v_id and zone_id = p_zone_id;

  if not found then
    raise exception 'Regra não encontrada.' using errcode = 'P0002';
  end if;

  delete from public.rule_sources where zoning_rule_id = v_id;
  insert into public.rule_sources (
    zoning_rule_id, field, legal_document_id, article, excerpt, page, condition,
    resolution_note, excerpt_verified
  )
  select v_id, s ->> 'field', (s ->> 'legal_document_id')::uuid, s ->> 'article',
         nullif(s ->> 'excerpt', ''), (s ->> 'page')::integer, nullif(s ->> 'condition', ''),
         nullif(s ->> 'resolution_note', ''), (s ->> 'excerpt_verified')::boolean
    from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) s;

  return v_id;
end;
$$;

-- Busca na legislação: híbrida (palavras + sentido) e só normas vigentes ----------
-- RRF (reciprocal rank fusion) junta as duas listas sem calibrar escalas.
-- Sem embedding (chave da Voyage ausente), vira a busca lexical de antes.

drop function public.buscar_texto_legal(uuid, text, integer);

create function public.buscar_texto_legal(
  p_municipality_id uuid,
  p_query text,
  p_limit integer default 5,
  p_embedding extensions.vector(1024) default null
)
returns table (
  legal_document_id uuid,
  documento text,
  is_fictitious boolean,
  article text,
  content text,
  page_start integer,
  page_end integer,
  rank real
)
language sql
stable
set search_path = ''
as $$
  with vigentes as (
    select d.id, d.kind, d.number, d.is_fictitious
      from public.legal_documents d
     where d.municipality_id = p_municipality_id
       and (d.effective_from is null or d.effective_from <= current_date)
       and (d.effective_until is null or d.effective_until >= current_date)
       -- Revogada por inteiro (sem artigos listados) sai da busca.
       and not exists (
         select 1 from public.legal_document_links l
          where l.to_document_id = d.id and l.kind = 'revoga' and l.articles is null
       )
  ),
  q as (select websearch_to_tsquery('portuguese', p_query) as tsq),
  lexical as (
    select c.id, row_number() over (order by ts_rank(c.tsv, q.tsq) desc) as pos
      from public.legal_chunks c
      join vigentes v on v.id = c.legal_document_id, q
     where c.tsv @@ q.tsq
     limit 50
  ),
  semantica as (
    select c.id, row_number() over (order by c.embedding operator(extensions.<=>) p_embedding) as pos
      from public.legal_chunks c
      join vigentes v on v.id = c.legal_document_id
     where p_embedding is not null and c.embedding is not null
     order by c.embedding operator(extensions.<=>) p_embedding
     limit 50
  ),
  fundido as (
    select id, sum(1.0 / (60 + pos))::real as rank
      from (select id, pos from lexical union all select id, pos from semantica) u
     group by id
  )
  select v.id,
         v.kind::text || ' nº ' || v.number,
         v.is_fictitious,
         c.article,
         c.content,
         c.page_start,
         c.page_end,
         f.rank
    from fundido f
    join public.legal_chunks c on c.id = f.id
    join vigentes v on v.id = c.legal_document_id
   order by f.rank desc
   limit greatest(1, least(p_limit, 10))
$$;

revoke execute on function public.buscar_texto_legal(uuid, text, integer, extensions.vector) from public, anon;
grant execute on function public.buscar_texto_legal(uuid, text, integer, extensions.vector) to authenticated;

-- Fase 5 (correção): vigência legal no horário de Fortaleza.
--
-- A busca na legislação comparava a vigência com `current_date`, que segue o
-- fuso do banco (UTC). Entre 21h e meia-noite em Fortaleza o UTC já está no dia
-- seguinte: uma lei que entra em vigor amanhã aparecia como vigente hoje, e uma
-- lei no último dia de vigência sumia antes da hora. A revogação integral
-- também valia no momento do cadastro, não na entrada em vigor da norma
-- revogadora.
--
-- Esta migration só substitui funções (create or replace) e reaplica grants:
-- é idempotente, não muda migrations anteriores nem datas gravadas.
-- Testes de regressão: src/lib/legislacao/vigencia.test.ts (PGlite).

-- "Hoje" operacional do produto: a data civil em America/Fortaleza.
create or replace function private.data_operacional(p_instante timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select timezone('America/Fortaleza', p_instante)::date
$$;

-- Normas do município em vigor no dia `p_dia`:
-- - início e fim da vigência inclusivos (vigente do primeiro ao último dia);
-- - não arquivadas;
-- - sem revogação integral já em vigor: a revogação vale a partir da entrada
--   em vigor da norma revogadora (sem data informada, vale desde o cadastro).
create or replace function private.normas_vigentes(p_municipality_id uuid, p_dia date)
returns table (id uuid, kind public.legal_document_kind, number text, is_fictitious boolean)
language sql
stable
set search_path = ''
as $$
  select d.id, d.kind, d.number, d.is_fictitious
    from public.legal_documents d
   where d.municipality_id = p_municipality_id
     and d.archived_at is null
     and (d.effective_from is null or d.effective_from <= p_dia)
     and (d.effective_until is null or d.effective_until >= p_dia)
     and not exists (
       select 1
         from public.legal_document_links l
         join public.legal_documents r on r.id = l.from_document_id
        where l.to_document_id = d.id
          and l.kind = 'revoga'
          and l.articles is null
          and r.archived_at is null
          and (r.effective_from is null or r.effective_from <= p_dia)
     )
$$;

revoke execute on function private.data_operacional(timestamptz) from public, anon;
revoke execute on function private.normas_vigentes(uuid, date) from public, anon;
grant execute on function private.data_operacional(timestamptz) to authenticated;
grant execute on function private.normas_vigentes(uuid, date) to authenticated;

-- Mesma busca de 20261014050500, com as normas vigentes de hoje em Fortaleza.
create or replace function public.buscar_texto_legal(
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
    select * from private.normas_vigentes(p_municipality_id, private.data_operacional())
  ),
  q as (select websearch_to_tsquery('portuguese', p_query) as tsq),
  -- Mesma consulta com OU entre os termos: a pergunta raramente usa as mesmas
  -- palavras da lei ("coeficiente" × "índice de aproveitamento").
  -- Com negação ("-termo") a troca casaria quase tudo; aí fica só a lista estrita.
  q_ou as (
    select case when strpos(q.tsq::text, '!') = 0
                then nullif(replace(q.tsq::text, ' & ', ' | '), '')::tsquery
           end as tsq
      from q
  ),
  lexical as (
    select c.id, row_number() over (order by ts_rank(c.tsv, q.tsq) desc) as pos
      from public.legal_chunks c
      join vigentes v on v.id = c.legal_document_id, q
     where c.tsv @@ q.tsq
     order by ts_rank(c.tsv, q.tsq) desc
     limit 50
  ),
  lexical_ou as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q_ou.tsq, 1) desc) as pos
      from public.legal_chunks c
      join vigentes v on v.id = c.legal_document_id, q_ou
     where q_ou.tsq is not null and c.tsv @@ q_ou.tsq
     order by ts_rank_cd(c.tsv, q_ou.tsq, 1) desc
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
      from (
        select id, pos from lexical
        union all select id, pos from lexical_ou
        union all select id, pos from semantica
      ) u
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

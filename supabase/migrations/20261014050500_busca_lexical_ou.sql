-- Fase 5: busca por palavras também com OU entre os termos (ADR 0011). Sem
-- embeddings, a busca exigia todas as palavras no mesmo trecho e falhava com
-- sinônimos. Trechos que casam com todos os termos aparecem nas duas listas
-- e sobem no RRF. A lista com OU divide a nota pelo log do tamanho do trecho,
-- senão as tabelas grandes dos anexos ganham de qualquer artigo.

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
    select d.id, d.kind, d.number, d.is_fictitious
      from public.legal_documents d
     where d.municipality_id = p_municipality_id
       and d.archived_at is null
       and (d.effective_from is null or d.effective_from <= current_date)
       and (d.effective_until is null or d.effective_until >= current_date)
       and not exists (
         select 1 from public.legal_document_links l
          where l.to_document_id = d.id and l.kind = 'revoga' and l.articles is null
       )
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

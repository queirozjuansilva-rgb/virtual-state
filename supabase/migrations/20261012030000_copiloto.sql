-- Fase 3: copiloto (chat com IA).

-- Mensagens de sistema no meio da conversa (contexto do usuário, perfil do
-- investidor): o histórico é append-only (ADR 0009).
alter type public.message_role add value if not exists 'system';

-- Anexos: id do arquivo na Files API da Anthropic (referência estável entre turnos).
alter table public.attachments add column provider_file_id text;

-- Anexos do chat: bucket privado, cada usuário só acessa a própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "chat-attachments: dono lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "chat-attachments: dono envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "chat-attachments: dono remove"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Análise de um ponto fora do land bank: zona que contém o ponto, município e
-- camadas ambientais que o contêm. Sem zona, o município não tem cobertura.
create function public.analisar_ponto(p_lon double precision, p_lat double precision)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with pt as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326) as geom
  ),
  zona as (
    select z.id, z.code, z.name, z.municipality_id
      from public.zones z, pt
     where z.geom is not null and extensions.st_contains(z.geom, pt.geom)
     order by extensions.st_area(z.geom) asc
     limit 1
  ),
  municipio as (
    select m.id, m.name, m.uf, m.coverage_status
      from public.municipalities m
     where m.id = (select municipality_id from zona)
  ),
  camadas as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'kind', l.kind, 'name', l.name, 'is_fictitious', l.is_fictitious)), '[]'::jsonb) as lista
      from public.environmental_layers l, pt
     where extensions.st_contains(l.geom, pt.geom)
  )
  select jsonb_build_object(
    'zona', (select to_jsonb(zona) from zona),
    'municipio', (select to_jsonb(municipio) from municipio),
    'camadas', (select lista from camadas)
  )
$$;

-- Comparáveis num raio de um ponto (estudo fora do land bank).
create function public.comparables_near_point(
  p_lon double precision,
  p_lat double precision,
  p_typology public.comparable_typology,
  p_radius_m integer,
  p_since date
)
returns table (id uuid, price_m2 numeric, observed_on date, distance_m numeric, is_fictitious boolean)
language sql
stable
set search_path = ''
as $$
  with pt as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select c.id, c.price_m2, c.observed_on,
         round(extensions.st_distance(c.geom::extensions.geography, pt.g)::numeric, 1),
         c.is_fictitious
    from public.market_comparables c, pt
   where c.typology = p_typology
     and c.observed_on >= p_since
     and extensions.st_dwithin(c.geom::extensions.geography, pt.g, p_radius_m)
   order by 4
$$;

-- Busca no texto das leis (RAG lexical até a Fase 5 trazer os embeddings).
create function public.buscar_texto_legal(p_municipality_id uuid, p_query text, p_limit integer default 5)
returns table (
  legal_document_id uuid,
  documento text,
  is_fictitious boolean,
  article text,
  content text,
  rank real
)
language sql
stable
set search_path = ''
as $$
  select d.id,
         d.kind::text || ' nº ' || d.number,
         d.is_fictitious,
         c.article,
         c.content,
         ts_rank(c.tsv, q)
    from public.legal_chunks c
    join public.legal_documents d on d.id = c.legal_document_id,
         websearch_to_tsquery('portuguese', p_query) q
   where d.municipality_id = p_municipality_id
     and c.tsv @@ q
   order by 6 desc
   limit greatest(1, least(p_limit, 10))
$$;

revoke execute on function public.analisar_ponto(double precision, double precision) from public, anon;
revoke execute on function public.comparables_near_point(double precision, double precision, public.comparable_typology, integer, date) from public, anon;
revoke execute on function public.buscar_texto_legal(uuid, text, integer) from public, anon;
grant execute on function public.analisar_ponto(double precision, double precision) to authenticated;
grant execute on function public.comparables_near_point(double precision, double precision, public.comparable_typology, integer, date) to authenticated;
grant execute on function public.buscar_texto_legal(uuid, text, integer) to authenticated;

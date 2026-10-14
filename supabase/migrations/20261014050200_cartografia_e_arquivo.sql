-- Fase 5: cartografia oficial e arquivo dos dados fictícios (ADR 0011).
-- Dados reais (zonas e camadas da prefeitura) entram por importação em lote.
-- Dados fictícios do seed saem de cena sem serem apagados: archived_at os tira
-- das buscas, do copiloto e dos estudos, e dá para restaurar.

alter table public.zones add column archived_at timestamptz;
alter table public.environmental_layers add column archived_at timestamptz;
alter table public.lands add column archived_at timestamptz;
alter table public.market_comparables add column archived_at timestamptz;
alter table public.legal_documents add column archived_at timestamptz;

-- Geometria de importação: válida, só polígonos, sempre MultiPolygon em 4326.
create function private.multipolygon_valido(p_geojson jsonb)
returns extensions.geometry
language sql
immutable
set search_path = ''
as $$
  select case when extensions.st_isempty(g) then null else g end
    from (
      select extensions.st_multi(
               extensions.st_collectionextract(
                 extensions.st_makevalid(
                   extensions.st_force2d(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326))
                 ),
                 3
               )
             ) as g
    ) s
$$;

-- Zonas: insere ou atualiza pelo código; une as feições de mesma zona.
-- Itens: [{"code", "name", "description", "geojson"}].
create function public.admin_importar_zonas(
  p_municipality_id uuid,
  p_itens jsonb,
  p_legal_document_id uuid default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  insert into public.zones (municipality_id, code, name, kind, description, legal_document_id, geom)
  select p_municipality_id,
         left(i ->> 'code', 40),
         left(i ->> 'name', 200),
         'zona',
         i ->> 'description',
         p_legal_document_id,
         extensions.st_multi(extensions.st_unaryunion(private.multipolygon_valido(i -> 'geojson')))
    from jsonb_array_elements(p_itens) i
   where private.multipolygon_valido(i -> 'geojson') is not null
  on conflict (municipality_id, code) do update
     set name = excluded.name,
         description = excluded.description,
         geom = excluded.geom,
         legal_document_id = coalesce(excluded.legal_document_id, public.zones.legal_document_id),
         archived_at = null;
  get diagnostics v_total = row_count;

  -- Geometria nova: refaz a zona automática dos terrenos do município.
  update public.lands set geom = geom
   where municipality_id = p_municipality_id and geom is not null and zone_assignment = 'automatica';

  return v_total;
end;
$$;

-- Camadas de condicionantes (ambientais, patrimônio, risco, zonas especiais).
-- Reimportar a mesma fonte substitui as feições anteriores dela.
create function public.admin_importar_camadas(
  p_municipality_id uuid,
  p_kind public.environmental_layer_kind,
  p_source text,
  p_itens jsonb,
  p_substituir boolean
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  if length(coalesce(p_source, '')) < 3 then
    raise exception 'Informe a fonte da camada.' using errcode = '22023';
  end if;

  if p_substituir then
    delete from public.environmental_layers
     where municipality_id = p_municipality_id and source = p_source;
  end if;

  insert into public.environmental_layers (municipality_id, kind, name, source, geom)
  select p_municipality_id, p_kind, left(coalesce(nullif(i ->> 'name', ''), p_source), 200), p_source, g.geom
    from jsonb_array_elements(p_itens) i
    cross join lateral (select private.multipolygon_valido(i -> 'geojson') as geom) g
   where g.geom is not null;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- Arquivar (ou restaurar) os dados fictícios de um município.
create function public.admin_arquivar_ficticios(p_municipality_id uuid, p_arquivar boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_quando timestamptz := case when p_arquivar then now() else null end;
  v_docs integer; v_zonas integer; v_camadas integer; v_terrenos integer; v_comparaveis integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  update public.legal_documents set archived_at = v_quando
   where municipality_id = p_municipality_id and is_fictitious;
  get diagnostics v_docs = row_count;

  -- Zona fictícia = criada a partir de lei fictícia (seed).
  update public.zones z set archived_at = v_quando
   where z.municipality_id = p_municipality_id
     and exists (select 1 from public.legal_documents d where d.id = z.legal_document_id and d.is_fictitious);
  get diagnostics v_zonas = row_count;

  update public.environmental_layers set archived_at = v_quando
   where municipality_id = p_municipality_id and is_fictitious;
  get diagnostics v_camadas = row_count;

  update public.lands set archived_at = v_quando
   where municipality_id = p_municipality_id and is_fictitious;
  get diagnostics v_terrenos = row_count;

  update public.market_comparables set archived_at = v_quando
   where municipality_id = p_municipality_id and is_fictitious;
  get diagnostics v_comparaveis = row_count;

  -- Terrenos reais com zona automática: a zona fictícia deixa de valer.
  update public.lands set geom = geom
   where municipality_id = p_municipality_id and geom is not null
     and zone_assignment = 'automatica' and archived_at is null;

  return jsonb_build_object(
    'documentos', v_docs, 'zonas', v_zonas, 'camadas', v_camadas,
    'terrenos', v_terrenos, 'comparaveis', v_comparaveis
  );
end;
$$;

revoke execute on function public.admin_importar_zonas(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.admin_importar_camadas(uuid, public.environmental_layer_kind, text, jsonb, boolean) from public, anon;
revoke execute on function public.admin_arquivar_ficticios(uuid, boolean) from public, anon;
grant execute on function public.admin_importar_zonas(uuid, jsonb, uuid) to authenticated;
grant execute on function public.admin_importar_camadas(uuid, public.environmental_layer_kind, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_arquivar_ficticios(uuid, boolean) to authenticated;

-- Funções espaciais e de busca passam a ignorar o que está arquivado ----------------

create or replace function private.assign_land_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.geom is null then
    new.zones_overlap_count := 0;
    if new.zone_assignment = 'automatica' then
      new.zone_id := null;
    end if;
    return new;
  end if;

  select count(*)
    into new.zones_overlap_count
    from public.zones z
   where z.municipality_id = new.municipality_id
     and z.archived_at is null
     and z.geom is not null
     and extensions.st_relate(z.geom, new.geom, '2********');

  if new.zone_assignment = 'automatica' then
    new.zone_id := (
      select z.id
        from public.zones z
       where z.municipality_id = new.municipality_id
         and z.archived_at is null
         and z.geom is not null
         and extensions.st_relate(z.geom, new.geom, '2********')
       order by extensions.st_area(extensions.st_intersection(z.geom, new.geom)::extensions.geography) desc
       limit 1
    );
  end if;

  return new;
end;
$$;

create or replace function public.identify_zones(p_geojson jsonb, p_municipality_id uuid)
returns table (
  zone_id uuid,
  code text,
  name text,
  overlap_m2 numeric,
  overlap_ratio numeric
)
language sql
stable
set search_path = ''
as $$
  with input as (
    select extensions.st_multi(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)
    ) as geom
  ),
  hits as (
    select z.id, z.code, z.name,
           extensions.st_area(extensions.st_intersection(z.geom, i.geom)::extensions.geography) as inter,
           extensions.st_area(i.geom::extensions.geography) as total
      from public.zones z, input i
     where z.municipality_id = p_municipality_id
       and z.archived_at is null
       and z.geom is not null
       and extensions.st_intersects(z.geom, i.geom)
  )
  select id, code, name, round(inter::numeric, 2), round((inter / nullif(total, 0))::numeric, 4)
    from hits
   where inter > 0
   order by inter desc
$$;

create or replace function public.environmental_hits(p_geojson jsonb, p_municipality_id uuid)
returns table (
  layer_id uuid,
  kind public.environmental_layer_kind,
  name text,
  source text,
  is_fictitious boolean,
  overlap_m2 numeric
)
language sql
stable
set search_path = ''
as $$
  with input as (
    select extensions.st_multi(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)
    ) as geom
  )
  select l.id, l.kind, l.name, l.source, l.is_fictitious,
         round(extensions.st_area(extensions.st_intersection(l.geom, i.geom)::extensions.geography)::numeric, 2)
    from public.environmental_layers l, input i
   where l.municipality_id = p_municipality_id
     and l.archived_at is null
     and extensions.st_intersects(l.geom, i.geom)
   order by 6 desc
$$;

create or replace function public.analisar_ponto(p_lon double precision, p_lat double precision)
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
     where z.archived_at is null and z.geom is not null and extensions.st_contains(z.geom, pt.geom)
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
     where l.archived_at is null and extensions.st_contains(l.geom, pt.geom)
  )
  select jsonb_build_object(
    'zona', (select to_jsonb(zona) from zona),
    'municipio', (select to_jsonb(municipio) from municipio),
    'camadas', (select lista from camadas)
  )
$$;

create or replace function public.comparables_near_point(
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
   where c.archived_at is null
     and c.typology = p_typology
     and c.observed_on >= p_since
     and extensions.st_dwithin(c.geom::extensions.geography, pt.g, p_radius_m)
   order by 4
$$;

create or replace function public.comparables_near_land(
  p_land_id uuid,
  p_typology public.comparable_typology,
  p_radius_m integer,
  p_since date
)
returns table (
  id uuid,
  price_m2 numeric,
  observed_on date,
  distance_m numeric,
  is_fictitious boolean
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.price_m2, c.observed_on,
         round(extensions.st_distance(c.geom::extensions.geography, l.centroid::extensions.geography)::numeric, 1),
         c.is_fictitious
    from public.lands l
    join public.market_comparables c on c.municipality_id = l.municipality_id
   where l.id = p_land_id
     and l.centroid is not null
     and c.archived_at is null
     and c.typology = p_typology
     and c.observed_on >= p_since
     and extensions.st_dwithin(c.geom::extensions.geography, l.centroid::extensions.geography, p_radius_m)
   order by 4
$$;

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

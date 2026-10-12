-- Fase 1: Land Bank (terrenos), contatos do proprietário, documentos e fotos.

create type public.land_status as enum (
  'disponivel', 'em_negociacao', 'reservado', 'vendido', 'indisponivel'
);
create type public.negotiation_type as enum (
  'dinheiro', 'permuta_fisica', 'permuta_financeira', 'misto'
);
create type public.topography as enum ('plano', 'aclive', 'declive', 'irregular');
create type public.land_shape as enum ('retangular', 'trapezoidal', 'irregular');
create type public.zone_assignment as enum ('automatica', 'manual');
create type public.land_document_kind as enum (
  'matricula', 'escritura', 'levantamento_topografico', 'certidao', 'outro'
);

create table public.lands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) between 1 and 40),
  address text not null,
  neighborhood text,
  municipality_id uuid not null references public.municipalities (id) on delete restrict,
  cep char(8) check (cep ~ '^[0-9]{8}$'),

  -- Geometria do lote. Área calculada no elipsoide (m²); pode ser sobrescrita.
  geom extensions.geometry(MultiPolygon, 4326) check (geom is null or extensions.st_isvalid(geom)),
  geojson jsonb generated always as (extensions.st_asgeojson(geom, 7)::jsonb) stored,
  centroid extensions.geometry(Point, 4326)
    generated always as (extensions.st_pointonsurface(geom)) stored,
  area_calculada_m2 numeric(14, 2)
    generated always as (round(extensions.st_area(geom::extensions.geography)::numeric, 2)) stored,
  area_informada_m2 numeric(14, 2) check (area_informada_m2 > 0),
  area_m2 numeric(14, 2) generated always as (
    coalesce(area_informada_m2, round(extensions.st_area(geom::extensions.geography)::numeric, 2))
  ) stored,

  -- Físico
  testada_principal_m numeric(8, 2) check (testada_principal_m > 0),
  testadas_m numeric(8, 2)[] not null default '{}',
  topografia public.topography,
  declividade_pct numeric(5, 2) check (declividade_pct >= 0),
  formato public.land_shape,
  esquina boolean not null default false,

  -- Jurídico / documental
  matricula_numero text,
  cartorio text,
  onus text,
  status public.land_status not null default 'disponivel',

  -- Comercial
  preco_pedido numeric(16, 2) check (preco_pedido >= 0),
  negociacao public.negotiation_type,
  permuta_pct numeric(5, 4) check (permuta_pct between 0 and 1),

  -- Zoneamento: identificado por interseção (automatica) ou atribuído à mão.
  zone_id uuid references public.zones (id) on delete set null,
  zone_assignment public.zone_assignment not null default 'automatica',
  zones_overlap_count integer not null default 0,

  -- Restrições físico-ambientais (checklist manual)
  tem_app boolean not null default false,
  tem_area_alagavel boolean not null default false,
  tem_faixa_dominio boolean not null default false,
  tem_tombamento boolean not null default false,
  tem_servidao boolean not null default false,
  restricoes_obs text,

  observacoes text,
  is_fictitious boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (zone_assignment = 'automatica' or zone_id is not null)
);

create index lands_geom_idx on public.lands using gist (geom);
create index lands_centroid_idx on public.lands using gist (centroid);
create index lands_municipality_idx on public.lands (municipality_id);
create index lands_zone_idx on public.lands (zone_id);
create index lands_status_idx on public.lands (status);

create trigger lands_set_updated_at
  before update on public.lands
  for each row execute function public.set_updated_at();

-- Identificação automática da zona -------------------------------------------
-- Regra de 2026-10-11: zona com maior área de interseção; o número de zonas
-- cruzadas fica em zones_overlap_count (vira flag de risco no motor).

create function private.assign_land_zone()
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
     and z.geom is not null
     and extensions.st_relate(z.geom, new.geom, '2********');

  if new.zone_assignment = 'automatica' then
    new.zone_id := (
      select z.id
        from public.zones z
       where z.municipality_id = new.municipality_id
         and z.geom is not null
         and extensions.st_relate(z.geom, new.geom, '2********')
       order by extensions.st_area(extensions.st_intersection(z.geom, new.geom)::extensions.geography) desc
       limit 1
    );
  end if;

  return new;
end;
$$;

create trigger lands_assign_zone
  before insert or update of geom, municipality_id, zone_assignment, zone_id on public.lands
  for each row execute function private.assign_land_zone();

-- Prévia para a UI: zonas que um polígono (GeoJSON) cruza, em ordem de área.
create function public.identify_zones(p_geojson jsonb, p_municipality_id uuid)
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
       and z.geom is not null
       and extensions.st_intersects(z.geom, i.geom)
  )
  select id, code, name, round(inter::numeric, 2), round((inter / nullif(total, 0))::numeric, 4)
    from hits
   where inter > 0
   order by inter desc
$$;

-- Camadas ambientais que um polígono cruza (APP, área alagável etc.).
create function public.environmental_hits(p_geojson jsonb, p_municipality_id uuid)
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
     and extensions.st_intersects(l.geom, i.geom)
   order by 6 desc
$$;

revoke execute on function public.identify_zones(jsonb, uuid) from public, anon;
revoke execute on function public.environmental_hits(jsonb, uuid) from public, anon;
grant execute on function public.identify_zones(jsonb, uuid) to authenticated;
grant execute on function public.environmental_hits(jsonb, uuid) to authenticated;

-- Contato do proprietário: tabela separada, só admin ---------------------------

create table public.land_owner_contacts (
  land_id uuid primary key references public.lands (id) on delete cascade,
  owner_name text,
  phone text,
  email text,
  notes text,
  updated_at timestamptz not null default now()
);

create trigger land_owner_contacts_set_updated_at
  before update on public.land_owner_contacts
  for each row execute function public.set_updated_at();

-- Documentos e fotos (arquivos no Storage) -------------------------------------

create table public.land_documents (
  id uuid primary key default gen_random_uuid(),
  land_id uuid not null references public.lands (id) on delete cascade,
  kind public.land_document_kind not null,
  name text not null,
  storage_path text not null unique,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index land_documents_land_idx on public.land_documents (land_id);

create table public.land_photos (
  id uuid primary key default gen_random_uuid(),
  land_id uuid not null references public.lands (id) on delete cascade,
  storage_path text not null unique,
  caption text,
  position integer not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index land_photos_land_idx on public.land_photos (land_id);

-- RLS ---------------------------------------------------------------------------

alter table public.lands enable row level security;
alter table public.land_owner_contacts enable row level security;
alter table public.land_documents enable row level security;
alter table public.land_photos enable row level security;

-- TODO(cliente): pendência 4 (visibilidade do land bank entre organizações).
-- Default: membros veem terrenos disponíveis; admin vê todos.
create policy "lands: disponíveis para todos; admin vê todos" on public.lands
  for select to authenticated
  using (status = 'disponivel' or (select private.is_admin()));

create policy "land_photos: conforme o terreno" on public.land_photos
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.lands l where l.id = land_id and l.status = 'disponivel')
  );

-- TODO(cliente): documentos (matrícula etc.) só para admin até definirmos a regra.
create policy "land_documents: admin lê" on public.land_documents
  for select to authenticated using ((select private.is_admin()));
create policy "land_owner_contacts: admin lê" on public.land_owner_contacts
  for select to authenticated using ((select private.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['lands', 'land_owner_contacts', 'land_documents', 'land_photos'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      t || ': admin insere', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || ': admin atualiza', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      t || ': admin remove', t);
  end loop;
end;
$$;

-- Storage ------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('land-documents', 'land-documents', false, 20971520,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('land-photos', 'land-photos', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('legal-documents', 'legal-documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "storage: leitura de fotos e leis; documentos de terreno só admin"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('land-photos', 'legal-documents')
    or (bucket_id = 'land-documents' and (select private.is_admin()))
  );

create policy "storage: admin envia arquivos do land bank e leis"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('land-documents', 'land-photos', 'legal-documents')
    and (select private.is_admin())
  );

create policy "storage: admin atualiza arquivos do land bank e leis"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('land-documents', 'land-photos', 'legal-documents')
    and (select private.is_admin())
  );

create policy "storage: admin remove arquivos do land bank e leis"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('land-documents', 'land-photos', 'legal-documents')
    and (select private.is_admin())
  );

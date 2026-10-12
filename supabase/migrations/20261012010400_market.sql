-- Fase 1: dados de mercado (CUB, comparáveis, indicadores).

-- Padrões da NBR 12721 (projetos-padrão do CUB).
create table public.cub_values (
  id uuid primary key default gen_random_uuid(),
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  reference_month date not null check (extract(day from reference_month) = 1),
  standard text not null check (standard in (
    'R1-B', 'R1-N', 'R1-A', 'PP4-B', 'PP4-N', 'R8-B', 'R8-N', 'R8-A', 'PIS', 'R16-N', 'R16-A',
    'CAL8-N', 'CAL8-A', 'CSL8-N', 'CSL8-A', 'CSL16-N', 'CSL16-A', 'RP1Q', 'GI'
  )),
  value_m2 numeric(12, 2) not null check (value_m2 > 0),
  source text not null,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  unique (uf, reference_month, standard)
);

create index cub_values_lookup_idx on public.cub_values (uf, standard, reference_month desc);

-- CUB mais recente da UF para um padrão (o PRD proíbe mês fixo na UI).
create function public.latest_cub(p_uf text, p_standard text default 'R8-N')
returns setof public.cub_values
language sql
stable
set search_path = ''
as $$
  select *
    from public.cub_values
   where uf = upper(p_uf) and standard = p_standard
   order by reference_month desc
   limit 1
$$;

create type public.comparable_typology as enum (
  'apartamento', 'casa', 'sala_comercial', 'loja', 'lote', 'outro'
);
create type public.comparable_kind as enum ('lancamento', 'oferta', 'venda');

create table public.market_comparables (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  neighborhood text,
  address text,
  geom extensions.geometry(Point, 4326) not null,
  typology public.comparable_typology not null,
  bedrooms integer check (bedrooms >= 0),
  private_area_m2 numeric(10, 2) not null check (private_area_m2 > 0),
  price numeric(16, 2) not null check (price > 0),
  price_m2 numeric(12, 2) generated always as (round(price / private_area_m2, 2)) stored,
  observed_on date not null,
  kind public.comparable_kind not null default 'oferta',
  source text not null,
  source_url text,
  notes text,
  is_fictitious boolean not null default false,
  created_at timestamptz not null default now()
);

create index market_comparables_geom_idx on public.market_comparables using gist (geom);
create index market_comparables_lookup_idx
  on public.market_comparables (municipality_id, typology, observed_on desc);

create table public.market_indicators (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  neighborhood text,
  period date not null check (extract(day from period) = 1),
  vso_pct numeric(6, 4) check (vso_pct between 0 and 1),
  stock_units integer check (stock_units >= 0),
  avg_price_m2 numeric(12, 2) check (avg_price_m2 > 0),
  source text not null,
  created_at timestamptz not null default now()
);

create index market_indicators_lookup_idx
  on public.market_indicators (municipality_id, neighborhood, period desc);

alter table public.cub_values enable row level security;
alter table public.market_comparables enable row level security;
alter table public.market_indicators enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cub_values', 'market_comparables', 'market_indicators'] loop
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

revoke execute on function public.latest_cub(text, text) from public, anon;
grant execute on function public.latest_cub(text, text) to authenticated;

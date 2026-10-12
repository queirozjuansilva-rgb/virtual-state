-- Fase 1: organizações (multi-tenant), vínculos e perfil do investidor.

-- Helpers de RLS (schema private, não exposto pela API) ----------------------

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false)
$$;

create function private.has_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = any (roles) from public.profiles where id = (select auth.uid())),
    false
  )
$$;

-- Organizações ----------------------------------------------------------------

create type public.org_kind as enum ('incorporadora', 'construtora', 'investidor', 'outro');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  kind public.org_kind not null default 'incorporadora',
  -- TODO(cliente): plano/assinatura (pendência 5). Só rótulo no MVP.
  plan_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Decisão de 2026-10-11: por enquanto, um usuário pertence a uma organização.
-- Remova este índice para permitir várias.
create unique index memberships_one_org_per_user on public.memberships (user_id);
create index memberships_user_idx on public.memberships (user_id);

create function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.memberships where user_id = (select auth.uid())
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

create policy "organizations: membros e admin leem"
  on public.organizations for select to authenticated
  using (id in (select private.user_org_ids()) or (select private.is_admin()));

create policy "organizations: dono atualiza"
  on public.organizations for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = organizations.id
        and m.user_id = (select auth.uid())
        and m.is_owner
    )
  );

-- O dono só renomeia/reclassifica; plano é gerido pelo admin.
revoke update on public.organizations from authenticated;
grant update (name, kind) on public.organizations to authenticated;

create policy "memberships: usuário vê os próprios; admin vê todos"
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Cadastro: cria perfil + organização pessoal ---------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  v_org uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, v_name);

  insert into public.organizations (name)
  values ('Organização de ' || coalesce(v_name, split_part(new.email, '@', 1)))
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, is_owner)
  values (v_org, new.id, true);

  return new;
end;
$$;

-- Usuários que já existiam antes desta migration ganham uma organização.
do $$
declare
  r record;
  v_org uuid;
begin
  for r in
    select u.id, u.email, p.full_name
    from auth.users u
    join public.profiles p on p.id = u.id
    where not exists (select 1 from public.memberships m where m.user_id = u.id)
  loop
    insert into public.organizations (name)
    values ('Organização de ' || coalesce(r.full_name, split_part(r.email, '@', 1)))
    returning id into v_org;
    insert into public.memberships (organization_id, user_id, is_owner)
    values (v_org, r.id, true);
  end loop;
end;
$$;

-- Perfil do investidor (contexto do copiloto) ----------------------------------

create type public.acquisition_model as enum ('compra', 'permuta');
create type public.risk_tolerance as enum ('baixa', 'media', 'alta');

create table public.investor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ticket_min numeric(16, 2) check (ticket_min >= 0),
  ticket_max numeric(16, 2) check (ticket_max >= 0),
  typologies text[] not null default '{}',
  regions text[] not null default '{}',
  acquisition_models public.acquisition_model[] not null default '{}',
  min_margin numeric(6, 4) check (min_margin between -1 and 1),
  risk_tolerance public.risk_tolerance,
  horizon_months integer check (horizon_months > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ticket_min is null or ticket_max is null or ticket_min <= ticket_max)
);

create index investor_profiles_org_idx on public.investor_profiles (organization_id);

create trigger investor_profiles_set_updated_at
  before update on public.investor_profiles
  for each row execute function public.set_updated_at();

alter table public.investor_profiles enable row level security;

create policy "investor_profiles: dono gerencia"
  on public.investor_profiles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and organization_id in (select private.user_org_ids())
  );

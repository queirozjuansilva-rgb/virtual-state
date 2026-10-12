-- Fase 0: perfis de usuário e papéis.
-- O restante do schema (organizações, terrenos, regras etc.) entra na Fase 1.

create type public.app_role as enum ('admin', 'analista', 'membro', 'proprietario');
comment on type public.app_role is
  'proprietario é reservado (fora do MVP).';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'membro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Papel do usuário atual. security definer para não recursar na RLS de profiles.
create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create policy "profiles: usuário lê o próprio perfil"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admin lê todos"
  on public.profiles for select
  to authenticated
  using ((select public.current_app_role()) = 'admin');

create policy "profiles: usuário atualiza o próprio perfil"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- O usuário só pode alterar o próprio nome; o papel é gerido pelo admin
-- (via service role, Fase 1).
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil automaticamente no cadastro.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_app_role() from public, anon;

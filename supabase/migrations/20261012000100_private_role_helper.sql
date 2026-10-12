-- Helpers de RLS ficam no schema `private`, que não é exposto pela API
-- (evita chamada via /rest/v1/rpc). Também une as políticas de SELECT de
-- profiles numa só (uma política permissiva por ação/papel).

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

revoke execute on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

drop policy "profiles: usuário lê o próprio perfil" on public.profiles;
drop policy "profiles: admin lê todos" on public.profiles;

create policy "profiles: usuário lê o próprio perfil; admin lê todos"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_app_role()) = 'admin'
  );

drop function public.current_app_role();

-- Fase 5 (ajustes da auditoria): CPES só para administradores e relatórios de
-- dados de teste fora do alcance de usuários comuns.
--
-- 1. Indicadores do CPES (market_indicators): o direito de redistribuição dos
--    dados do Sinduscon-CE ainda não foi confirmado (Blueprint v2.2, p. 32). A
--    leitura passa a ser só de administradores, até a confirmação. Os dados
--    ficam como estão.
-- 2. Relatórios de terreno fictício ou arquivado (ex.: VE-0004, do seed):
--    usuários comuns deixam de vê-los, criá-los, editá-los ou apagá-los;
--    administradores continuam vendo, com a identificação de "dados de teste".
--    Relatórios de terreno real e de ponto (sem terreno) não mudam.
--
-- Idempotente: drop policy if exists + create policy, create or replace function.
-- Testes de regressão: src/server/relatorios/rls.test.ts (PGlite).

-- 1. CPES ----------------------------------------------------------------------

drop policy if exists "market_indicators: leitura" on public.market_indicators;
drop policy if exists "market_indicators: admin lê" on public.market_indicators;
create policy "market_indicators: admin lê" on public.market_indicators
  for select to authenticated
  using ((select private.is_admin()));

-- 2. Relatórios de dados de teste ----------------------------------------------

-- Terreno de teste: fictício (seed) ou arquivado. SECURITY DEFINER porque a RLS
-- de lands esconde de usuários comuns os terrenos que não estão disponíveis, e
-- a regra precisa valer para qualquer terreno. Só devolve um booleano.
create or replace function private.terreno_de_teste(p_land_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.is_fictitious or l.archived_at is not null from public.lands l where l.id = p_land_id),
    false
  )
$$;

revoke execute on function private.terreno_de_teste(uuid) from public, anon;
grant execute on function private.terreno_de_teste(uuid) to authenticated;

drop policy if exists "reports: organização e admin leem" on public.reports;
create policy "reports: organização e admin leem" on public.reports
  for select to authenticated
  using (
    (organization_id in (select private.user_org_ids()) and not private.terreno_de_teste(land_id))
    or (select private.is_admin())
  );

drop policy if exists "reports: membro cria na própria organização" on public.reports;
create policy "reports: membro cria na própria organização" on public.reports
  for insert to authenticated
  with check (
    organization_id in (select private.user_org_ids()) and created_by = (select auth.uid())
    and (not private.terreno_de_teste(land_id) or (select private.is_admin()))
  );

drop policy if exists "reports: organização atualiza" on public.reports;
create policy "reports: organização atualiza" on public.reports
  for update to authenticated
  using (
    organization_id in (select private.user_org_ids())
    and (not private.terreno_de_teste(land_id) or (select private.is_admin()))
  )
  with check (
    organization_id in (select private.user_org_ids())
    and (not private.terreno_de_teste(land_id) or (select private.is_admin()))
  );

drop policy if exists "reports: organização remove" on public.reports;
create policy "reports: organização remove" on public.reports
  for delete to authenticated
  using (
    organization_id in (select private.user_org_ids())
    and (not private.terreno_de_teste(land_id) or (select private.is_admin()))
  );

-- Revisões de analista (SECURITY DEFINER, não passa pela RLS de reports): mesma
-- regra de leitura do relatório.
create or replace function public.revisoes_do_relatorio(p_report_id uuid)
returns table (
  id uuid,
  report_version_id uuid,
  versao integer,
  verdict public.review_verdict,
  comment text,
  revisor text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.report_version_id, v.version, a.verdict, a.comment,
         coalesce(nullif(trim(p.full_name), ''), 'Analista'), a.created_at
    from public.analyst_reviews a
    left join public.report_versions v on v.id = a.report_version_id
    left join public.profiles p on p.id = a.reviewer_id
   where a.report_id = p_report_id
     and exists (
       select 1 from public.reports r
        where r.id = p_report_id
          and (
            (r.organization_id in (select private.user_org_ids()) and not private.terreno_de_teste(r.land_id))
            or (select private.is_admin())
          )
     )
   order by a.created_at desc
$$;

revoke execute on function public.revisoes_do_relatorio(uuid) from public, anon;
grant execute on function public.revisoes_do_relatorio(uuid) to authenticated;

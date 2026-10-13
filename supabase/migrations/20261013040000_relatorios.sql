-- Fase 4: relatório de viabilidade interativo (ADR 0010).

-- Contexto do estudo (referência exibida e ponto, para estudos fora do land
-- bank). A entrada do motor não guarda localização.
alter table public.analysis_runs add column contexto jsonb not null default '{}'::jsonb;
alter table public.reports add column contexto jsonb not null default '{}'::jsonb;

-- Cria o relatório a partir de um estudo registrado (versão 1 = o estudo).
-- Idempotente: se a organização já tem relatório desse estudo, devolve-o.
create function public.criar_relatorio(p_analysis_run_id uuid, p_titulo text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.analysis_runs;
  v_id uuid;
begin
  select * into v_run from public.analysis_runs where id = p_analysis_run_id;
  if not found then
    raise exception 'Estudo não encontrado ou sem permissão de acesso.' using errcode = 'P0002';
  end if;

  select r.id into v_id
    from public.reports r
   where r.analysis_run_id = p_analysis_run_id
     and r.organization_id in (select private.user_org_ids())
   order by r.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.reports (analysis_run_id, land_id, title, contexto)
  values (v_run.id, v_run.land_id, left(trim(p_titulo), 200), v_run.contexto)
  returning id into v_id;

  insert into public.report_versions (report_id, version, input, output, engine_version)
  values (v_id, 1, v_run.input, v_run.output, v_run.engine_version);

  return v_id;
end;
$$;

-- Salva uma nova versão. Falha se alguém salvou depois da versão em edição.
create function public.salvar_versao_relatorio(
  p_report_id uuid,
  p_versao_base integer,
  p_input jsonb,
  p_output jsonb,
  p_engine_version text,
  p_analysis_run_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_atual integer;
begin
  select current_version into v_atual from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Relatório não encontrado ou sem permissão de acesso.' using errcode = 'P0002';
  end if;
  if v_atual <> p_versao_base then
    raise exception 'Outra pessoa salvou a versão % enquanto você editava.', v_atual
      using errcode = 'P0001', hint = 'versao_desatualizada';
  end if;

  insert into public.report_versions (report_id, version, input, output, engine_version)
  values (p_report_id, v_atual + 1, p_input, p_output, p_engine_version);

  update public.reports
     set current_version = v_atual + 1,
         analysis_run_id = coalesce(p_analysis_run_id, analysis_run_id)
   where id = p_report_id;

  return v_atual + 1;
end;
$$;

revoke execute on function public.criar_relatorio(uuid, text) from public, anon;
revoke execute on function public.salvar_versao_relatorio(uuid, integer, jsonb, jsonb, text, uuid)
  from public, anon;
grant execute on function public.criar_relatorio(uuid, text) to authenticated;
grant execute on function public.salvar_versao_relatorio(uuid, integer, jsonb, jsonb, text, uuid)
  to authenticated;

-- Link compartilhável: última versão salva, somente leitura, sem login.
-- Token aleatório de 43 caracteres (base64url de 32 bytes), gerado no servidor.
alter table public.reports
  add constraint reports_share_token_formato check (share_token is null or length(share_token) >= 32);

create function public.relatorio_compartilhado(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'titulo', r.title,
    'organizacao', o.name,
    'contexto', r.contexto,
    'versao', v.version,
    'salvo_em', v.created_at,
    'engine_version', v.engine_version,
    'input', v.input,
    'output', v.output,
    'terreno', (
      select jsonb_build_object(
        'code', l.code, 'address', l.address, 'neighborhood', l.neighborhood,
        'geojson', l.geojson, 'is_fictitious', l.is_fictitious,
        'municipio', m.name, 'uf', m.uf
      )
        from public.lands l
        join public.municipalities m on m.id = l.municipality_id
       where l.id = r.land_id
    )
  )
    from public.reports r
    join public.report_versions v on v.report_id = r.id and v.version = r.current_version
    join public.organizations o on o.id = r.organization_id
   where p_token is not null
     and length(p_token) >= 32
     and r.share_token = p_token
$$;

revoke execute on function public.relatorio_compartilhado(text) from public;
grant execute on function public.relatorio_compartilhado(text) to anon, authenticated;

-- Revisões de analista com o nome de quem revisou (membros não leem perfis
-- alheios). Só para quem pode ver o relatório.
create function public.revisoes_do_relatorio(p_report_id uuid)
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
          and (r.organization_id in (select private.user_org_ids()) or (select private.is_admin()))
     )
   order by a.created_at desc
$$;

revoke execute on function public.revisoes_do_relatorio(uuid) from public, anon;
grant execute on function public.revisoes_do_relatorio(uuid) to authenticated;

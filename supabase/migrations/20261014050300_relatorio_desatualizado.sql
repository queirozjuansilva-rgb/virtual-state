-- Fase 5: relatório desatualizado quando a regra urbanística muda (Blueprint
-- v2.2, p. 17: "nova versão marca análises afetadas como desatualizadas, sem
-- alterar PDFs exportados"). Cada estudo guarda a zona usada; validar ou
-- arquivar a regra daquela zona × uso marca os relatórios que dependem dela.

alter table public.analysis_runs
  add column zone_id uuid references public.zones (id) on delete set null;
create index analysis_runs_zone_idx on public.analysis_runs (zone_id);

alter table public.reports
  add column stale_since timestamptz,
  add column stale_reason text check (length(stale_reason) <= 500);

-- Zona do estudo: a do terreno ou a que contém o ponto (estudo fora do land bank).
create function private.zona_do_estudo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.zone_id is null and new.land_id is not null then
    select l.zone_id into new.zone_id from public.lands l where l.id = new.land_id;
  end if;
  if new.zone_id is null and new.contexto ? 'ponto' then
    select z.id into new.zone_id
      from public.zones z
     where z.archived_at is null and z.geom is not null
       and extensions.st_contains(
         z.geom,
         extensions.st_setsrid(extensions.st_makepoint(
           (new.contexto -> 'ponto' ->> 'longitude')::double precision,
           (new.contexto -> 'ponto' ->> 'latitude')::double precision), 4326))
     order by extensions.st_area(z.geom) asc
     limit 1;
  end if;
  return new;
end;
$$;

create trigger analysis_runs_zona
  before insert on public.analysis_runs
  for each row execute function private.zona_do_estudo();

-- Estudos já registrados: preenche a zona pelo terreno (pontos ficam sem).
update public.analysis_runs a set zone_id = l.zone_id
  from public.lands l
 where a.land_id = l.id and a.zone_id is null;

-- Regra entrou ou saiu de "validado": marca os relatórios daquela zona × uso.
-- SECURITY DEFINER: o admin muda a regra, mas os relatórios são de outras
-- organizações (RLS). A função só grava a marca de desatualizado.
create function private.marcar_relatorios_desatualizados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text;
begin
  if (new.status = 'validado') is not distinct from (old.status = 'validado') then
    return new;
  end if;
  select z.code into v_zona from public.zones z where z.id = new.zone_id;
  update public.reports r
     set stale_since = now(),
         stale_reason = format(
           'A regra urbanística da zona %s para este uso mudou em %s. Os números deste relatório usam a regra anterior.',
           v_zona, to_char(now() at time zone 'America/Fortaleza', 'DD/MM/YYYY')
         )
    from public.analysis_runs a
   where a.id = r.analysis_run_id
     and a.zone_id = new.zone_id
     and r.contexto ->> 'uso' = new.use_type::text
     and r.stale_since is null;
  return new;
end;
$$;

revoke execute on function private.marcar_relatorios_desatualizados() from public, anon, authenticated;

create trigger zoning_rules_desatualiza_relatorios
  after update of status on public.zoning_rules
  for each row execute function private.marcar_relatorios_desatualizados();

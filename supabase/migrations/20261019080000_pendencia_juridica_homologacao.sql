-- Pendência jurídica: trava da homologação de regras enquanto a vigência de uma
-- norma está sob análise jurídica (decisão de 19/10/2026).
--
-- Contexto: não está definido se a LC nº 450/2025 (novo Plano Diretor de
-- Fortaleza) entrou em vigor antes da LC nº 461/2026, que ampliou o prazo do seu
-- art. 620; portanto, também não está definido se a LC nº 62/2009 e a
-- LC nº 236/2017 continuam aplicáveis. Ainda não há especialista para o parecer.
-- Homologar uma regra que depende dessas leis seria assumir a resposta.
--
-- O que esta migration faz (só acrescenta; nenhuma regra, parâmetro, data de
-- vigência, revogação ou norma existente é alterada):
-- 1. legal_pendencies: a pendência, com o parecer que a encerra (parecer,
--    responsável e data, obrigatórios juntos); legal_pendency_documents: as
--    normas cuja vigência está em análise.
-- 2. Alcance: as normas ligadas e, em cadeia, as que agem sobre elas
--    (legal_document_links: altera, revoga, regulamenta, consolida). Uma regra
--    do mesmo município é alcançada se alguma fonte dela, ou a norma da zona,
--    estiver no alcance.
-- 3. Trava: gatilhos de restrição adiados (conferidos no fim da transação, depois
--    de as fontes serem regravadas) impedem que uma regra alcançada termine como
--    "validado". Salvar como rascunho continua livre.
-- 4. public.admin_resolver_pendencia_juridica: único caminho de desbloqueio.
-- 5. Registra a pendência de Fortaleza, ligada à LC 62/2009 e à LC 236/2017.
--    A pendência não define nenhuma lei como vigente ou revogada.
--
-- Idempotente (if not exists, drop ... if exists, create or replace, on conflict) e
-- atômica (só comandos transacionais; um erro desfaz tudo).
-- Operação no banco compartilhado (supabase/operacoes/):
--   ensaio sem gravação: ...homologacao.ensaio.sql (montado por ensaio.mts);
--   reversão completa, sem tocar em outros dados: ...homologacao.reversao.sql.
-- Testes: src/server/admin/pendencia-juridica.test.ts (PGlite).

-- 1. Tabelas ----------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'legal_pendency_status' and typnamespace = 'public'::regnamespace
  ) then
    create type public.legal_pendency_status as enum ('aberta', 'resolvida');
  end if;
end;
$$;

create table if not exists public.legal_pendencies (
  id uuid primary key default gen_random_uuid(),
  -- Identificador estável (registro idempotente e referência na documentação).
  code text not null unique check (code ~ '^[a-z0-9-]{3,80}$'),
  -- restrict: município ou norma em análise não some sem antes encerrar a pendência
  -- (a trava não pode deixar de valer em silêncio).
  municipality_id uuid not null references public.municipalities (id) on delete restrict,
  title text not null check (length(title) between 3 and 200),
  description text not null check (length(description) between 3 and 4000),
  status public.legal_pendency_status not null default 'aberta',
  opened_at timestamptz not null default now(),
  -- Encerramento: conclusão do parecer, responsável (nome e identificação) e data.
  opinion_summary text check (length(opinion_summary) <= 8000),
  opinion_author text check (length(opinion_author) <= 300),
  opinion_date date,
  opinion_reference text check (length(opinion_reference) <= 500),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Só se encerra com parecer, responsável e data (vale também para escrita direta).
  constraint legal_pendencies_encerramento_completo check (
    (status = 'aberta' and resolved_at is null)
    or (
      status = 'resolvida'
      and length(btrim(coalesce(opinion_summary, ''))) >= 10
      and length(btrim(coalesce(opinion_author, ''))) >= 3
      and opinion_date is not null
      and resolved_at is not null
    )
  )
);

create index if not exists legal_pendencies_municipality_idx
  on public.legal_pendencies (municipality_id, status);
create index if not exists legal_pendencies_resolved_by_idx
  on public.legal_pendencies (resolved_by);

create table if not exists public.legal_pendency_documents (
  pendency_id uuid not null references public.legal_pendencies (id) on delete cascade,
  legal_document_id uuid not null references public.legal_documents (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (pendency_id, legal_document_id)
);

create index if not exists legal_pendency_documents_document_idx
  on public.legal_pendency_documents (legal_document_id);

drop trigger if exists legal_pendencies_set_updated_at on public.legal_pendencies;
create trigger legal_pendencies_set_updated_at
  before update on public.legal_pendencies
  for each row execute function public.set_updated_at();

-- Auditoria: abertura e encerramento ficam no audit_log (quem, quando, o quê).
drop trigger if exists legal_pendencies_audit on public.legal_pendencies;
create trigger legal_pendencies_audit
  after insert or update or delete on public.legal_pendencies
  for each row execute function private.audit_row();
drop trigger if exists legal_pendency_documents_audit on public.legal_pendency_documents;
create trigger legal_pendency_documents_audit
  after insert or update or delete on public.legal_pendency_documents
  for each row execute function private.audit_row();

-- RLS: pendência aberta é aviso público para usuários logados (o copiloto mostra a
-- ressalva); o parecer de uma pendência encerrada fica só com administradores.
-- Escrita direta: ninguém. Abertura por migration; encerramento pela função abaixo.
alter table public.legal_pendencies enable row level security;
alter table public.legal_pendency_documents enable row level security;

drop policy if exists "legal_pendencies: abertas para todos; admin lê todas" on public.legal_pendencies;
create policy "legal_pendencies: abertas para todos; admin lê todas" on public.legal_pendencies
  for select to authenticated
  using (status = 'aberta' or (select private.is_admin()));

drop policy if exists "legal_pendency_documents: conforme a pendência" on public.legal_pendency_documents;
create policy "legal_pendency_documents: conforme a pendência" on public.legal_pendency_documents
  for select to authenticated
  using (exists (select 1 from public.legal_pendencies p where p.id = pendency_id));

-- 2. Alcance ----------------------------------------------------------------------

-- Normas alcançadas por uma pendência: as ligadas a ela (direta) e, em cadeia, as
-- que agem sobre elas. SECURITY DEFINER: a trava precisa ver tudo, sem depender da
-- RLS de quem salva.
create or replace function private.normas_da_pendencia(p_pendency_id uuid)
returns table (legal_document_id uuid, direta boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive alcance (doc, direta) as (
    select d.legal_document_id, true
      from public.legal_pendency_documents d
     where d.pendency_id = p_pendency_id
    union
    select l.from_document_id, false
      from public.legal_document_links l
      join alcance a on l.to_document_id = a.doc
  )
  select doc, bool_or(direta) from alcance group by doc
$$;

-- Pendências abertas que alcançam uma regra da zona `p_zone_id` com fontes nas
-- normas `p_document_ids` (o município é o da zona).
create or replace function private.pendencias_abertas_para(p_zone_id uuid, p_document_ids uuid[])
returns setof public.legal_pendencies
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.zones z
    join public.legal_pendencies p on p.municipality_id = z.municipality_id and p.status = 'aberta'
   where z.id = p_zone_id
     and exists (
       select 1
         from private.normas_da_pendencia(p.id) n
        where n.legal_document_id = any (coalesce(p_document_ids, '{}'))
           or n.legal_document_id = z.legal_document_id
     )
   order by p.opened_at
$$;

revoke execute on function private.normas_da_pendencia(uuid) from public, anon;
revoke execute on function private.pendencias_abertas_para(uuid, uuid[]) from public, anon;

-- 3. Trava -----------------------------------------------------------------------

-- Confere, no fim da transação, se a regra terminou "validado" estando alcançada
-- por uma pendência aberta. Lê o estado final (status e fontes regravadas).
create or replace function private.trava_homologacao_juridica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
  v_zone_id uuid;
  v_status public.rule_status;
  v_titulo text;
begin
  -- Em comandos separados: cada tabela só tem o próprio campo em NEW.
  if tg_table_name = 'rule_sources' then
    v_rule_id := new.zoning_rule_id;
  else
    v_rule_id := new.id;
  end if;

  select r.zone_id, r.status into v_zone_id, v_status from public.zoning_rules r where r.id = v_rule_id;
  if v_status is distinct from 'validado' then
    return null;
  end if;

  select p.title into v_titulo
    from private.pendencias_abertas_para(
      v_zone_id,
      array(select s.legal_document_id from public.rule_sources s where s.zoning_rule_id = v_rule_id)
    ) p
   limit 1;

  if v_titulo is not null then
    raise exception 'Homologação bloqueada — vigência sob análise jurídica (%).', v_titulo
      using errcode = 'VEJ01',
            hint = 'Salve como rascunho. A validação volta a ser possível depois do registro do parecer jurídico.';
  end if;
  return null;
end;
$$;

drop trigger if exists zoning_rules_trava_juridica on public.zoning_rules;
create constraint trigger zoning_rules_trava_juridica
  after insert or update on public.zoning_rules
  deferrable initially deferred
  for each row
  when (new.status = 'validado')
  execute function private.trava_homologacao_juridica();

drop trigger if exists rule_sources_trava_juridica on public.rule_sources;
create constraint trigger rule_sources_trava_juridica
  after insert or update of legal_document_id on public.rule_sources
  deferrable initially deferred
  for each row
  execute function private.trava_homologacao_juridica();

-- 4. Consultas do painel e desbloqueio ---------------------------------------------
--
-- Convenção do projeto (ADR 0011): funções do schema exposto (public) são SECURITY
-- INVOKER e conferem is_admin(); o que precisa de privilégio fica em private, que a
-- API não expõe.

-- Pendências abertas que impediriam validar uma regra da zona com estas fontes.
-- Só administradores (os demais recebem vazio).
create or replace function public.bloqueio_juridico(p_zone_id uuid, p_document_ids uuid[])
returns table (id uuid, code text, title text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.code, p.title
    from private.pendencias_abertas_para(p_zone_id, p_document_ids) p
   where (select private.is_admin())
$$;

-- Regras (pelas fontes salvas) que a validação bloquearia hoje. Só administradores.
create or replace function public.regras_com_bloqueio_juridico(p_rule_ids uuid[])
returns table (rule_id uuid, pendency_id uuid, title text)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, p.id, p.title
    from public.zoning_rules r
   cross join lateral private.pendencias_abertas_para(
     r.zone_id,
     array(select s.legal_document_id from public.rule_sources s where s.zoning_rule_id = r.id)
   ) p
   where r.id = any (coalesce(p_rule_ids, '{}'))
     and (select private.is_admin())
$$;

-- Tamanho do alcance de uma pendência (aberta ou não), para o painel. Só administradores.
create or replace function public.alcance_da_pendencia_juridica(p_pendency_id uuid)
returns table (normas_diretas integer, normas_relacionadas integer, regras integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with normas as (select * from private.normas_da_pendencia(p_pendency_id)),
  regras as (
    select r.id
      from public.zoning_rules r
      join public.zones z on z.id = r.zone_id
      join public.legal_pendencies p on p.id = p_pendency_id and p.municipality_id = z.municipality_id
     where r.status <> 'arquivado'
       and (
         z.legal_document_id in (select legal_document_id from normas)
         or exists (
           select 1 from public.rule_sources s
            where s.zoning_rule_id = r.id and s.legal_document_id in (select legal_document_id from normas)
         )
       )
  )
  select (select count(*) from normas where direta)::integer,
         (select count(*) from normas where not direta)::integer,
         (select count(*) from regras)::integer
   where (select private.is_admin())
$$;

-- Desbloqueio: encerra a pendência com o parecer, o responsável e a data. É o único
-- caminho (não há política de escrita direta). SECURITY DEFINER em private porque
-- grava numa tabela sem política de escrita; confere is_admin(). Fica no audit_log.
create or replace function private.resolver_pendencia_juridica(
  p_id uuid,
  p_parecer text,
  p_responsavel text,
  p_data date,
  p_referencia text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.legal_pendency_status;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_parecer, ''))) < 10 then
    raise exception 'Registre a conclusão do parecer jurídico.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_responsavel, ''))) < 3 then
    raise exception 'Informe o responsável pelo parecer (nome e identificação).' using errcode = '22023';
  end if;
  if p_data is null then
    raise exception 'Informe a data do parecer.' using errcode = '22023';
  end if;
  if p_data > private.data_operacional() then
    raise exception 'A data do parecer não pode ser futura.' using errcode = '22023';
  end if;

  select status into v_status from public.legal_pendencies where id = p_id for update;
  if not found then
    raise exception 'Pendência não encontrada.' using errcode = 'P0002';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Esta pendência já foi encerrada.' using errcode = '22023';
  end if;

  update public.legal_pendencies
     set status = 'resolvida',
         opinion_summary = btrim(p_parecer),
         opinion_author = btrim(p_responsavel),
         opinion_date = p_data,
         opinion_reference = nullif(btrim(coalesce(p_referencia, '')), ''),
         resolved_at = now(),
         resolved_by = (select auth.uid())
   where id = p_id;
end;
$$;

create or replace function public.admin_resolver_pendencia_juridica(
  p_id uuid,
  p_parecer text,
  p_responsavel text,
  p_data date,
  p_referencia text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.resolver_pendencia_juridica(p_id, p_parecer, p_responsavel, p_data, p_referencia)
$$;

revoke execute on function private.resolver_pendencia_juridica(uuid, text, text, date, text) from public, anon;
revoke execute on function public.bloqueio_juridico(uuid, uuid[]) from public, anon;
revoke execute on function public.regras_com_bloqueio_juridico(uuid[]) from public, anon;
revoke execute on function public.alcance_da_pendencia_juridica(uuid) from public, anon;
revoke execute on function public.admin_resolver_pendencia_juridica(uuid, text, text, date, text) from public, anon;
grant execute on function private.normas_da_pendencia(uuid) to authenticated;
grant execute on function private.pendencias_abertas_para(uuid, uuid[]) to authenticated;
grant execute on function private.resolver_pendencia_juridica(uuid, text, text, date, text) to authenticated;
grant execute on function public.bloqueio_juridico(uuid, uuid[]) to authenticated;
grant execute on function public.regras_com_bloqueio_juridico(uuid[]) to authenticated;
grant execute on function public.alcance_da_pendencia_juridica(uuid) to authenticated;
grant execute on function public.admin_resolver_pendencia_juridica(uuid, text, text, date, text) to authenticated;

-- 5. Pendência de Fortaleza ----------------------------------------------------------

insert into public.legal_pendencies (code, municipality_id, title, description)
select
  'vigencia-lc-450-2025',
  m.id,
  'Vigência da LC nº 450/2025 e efeitos da LC nº 461/2026',
  'Não está definido se a LC nº 450/2025 (novo Plano Diretor) entrou em vigor antes da '
  || 'publicação da LC nº 461/2026, que ampliou o prazo do seu art. 620, nem, por '
  || 'consequência, se a LC nº 62/2009 e a LC nº 236/2017 continuam aplicáveis. A minuta '
  || 'de consulta jurídica foi preparada em 19/10/2026 e aguarda análise de especialista. '
  || 'Enquanto esta pendência estiver aberta, nenhuma regra que dependa dessas leis pode '
  || 'ser homologada. Esta pendência não define nenhuma lei como vigente ou revogada.'
  from public.municipalities m
 where m.ibge_code = '2304400'
on conflict (code) do nothing;

insert into public.legal_pendency_documents (pendency_id, legal_document_id)
select p.id, d.id
  from public.legal_pendencies p
  join public.legal_documents d on d.municipality_id = p.municipality_id
 where p.code = 'vigencia-lc-450-2025'
   and d.kind = 'lei_complementar'
   and d.number in ('62/2009', '236/2017')
   and not d.is_fictitious
on conflict do nothing;

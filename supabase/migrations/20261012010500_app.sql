-- Fase 1: tabelas do motor, relatórios, chat, pedidos de cobertura e auditoria.
-- As telas que usam estas tabelas chegam nas Fases 2–6; o schema entra agora
-- para o modelo de dados ficar completo e coberto por RLS desde o início.

create function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.memberships
   where user_id = (select auth.uid())
   order by created_at
   limit 1
$$;

revoke execute on function private.current_org_id() from public, anon;
grant execute on function private.current_org_id() to authenticated;

-- Calibração do motor ----------------------------------------------------------

create table public.feasibility_defaults (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  description text not null,
  -- Origem do default (ex.: "valor usual de mercado", "Gabriel, 2026-11").
  source text not null,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger feasibility_defaults_set_updated_at
  before update on public.feasibility_defaults
  for each row execute function public.set_updated_at();

create type public.risk_axis as enum ('urbanistico', 'fisico', 'juridico', 'mercado');

create table public.risk_weights (
  flag_code text primary key check (flag_code ~ '^[a-z0-9_]+$'),
  axis public.risk_axis not null,
  weight numeric(6, 2) not null check (weight >= 0),
  label text not null,
  description text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger risk_weights_set_updated_at
  before update on public.risk_weights
  for each row execute function public.set_updated_at();

-- Execuções do motor (registro imutável para calibração) ----------------------

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
    references public.organizations (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  land_id uuid references public.lands (id) on delete set null,
  conversation_id uuid,
  input jsonb not null,
  output jsonb not null,
  engine_version text not null check (engine_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  created_at timestamptz not null default now()
);

create index analysis_runs_org_idx on public.analysis_runs (organization_id, created_at desc);
create index analysis_runs_land_idx on public.analysis_runs (land_id);

-- Relatórios e versões ---------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
    references public.organizations (id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  land_id uuid references public.lands (id) on delete set null,
  title text not null,
  current_version integer not null default 1 check (current_version > 0),
  -- Link compartilhável somente leitura (opcional no MVP).
  share_token text unique,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_org_idx on public.reports (organization_id, updated_at desc);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  version integer not null check (version > 0),
  input jsonb not null,
  output jsonb not null,
  engine_version text not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (report_id, version)
);

create type public.review_verdict as enum ('conferido', 'divergente');

create table public.analyst_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  report_version_id uuid references public.report_versions (id) on delete set null,
  reviewer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  verdict public.review_verdict not null,
  comment text,
  created_at timestamptz not null default now(),
  check (verdict = 'conferido' or length(trim(coalesce(comment, ''))) > 0)
);

create index analyst_reviews_report_idx on public.analyst_reviews (report_id);

-- Chat -------------------------------------------------------------------------

create type public.message_role as enum ('user', 'assistant', 'tool');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
    references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nova análise',
  land_id uuid references public.lands (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.analysis_runs
  add constraint analysis_runs_conversation_fk
  foreign key (conversation_id) references public.conversations (id) on delete set null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content jsonb not null,
  tool_calls jsonb,
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  uploaded_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index attachments_conversation_idx on public.attachments (conversation_id);

-- Pedidos de cobertura de município (lead para o admin) -----------------------

create type public.coverage_request_status as enum ('aberto', 'em_andamento', 'atendido', 'recusado');

create table public.coverage_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
    references public.organizations (id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  municipality_name text not null,
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  ibge_code char(7) check (ibge_code ~ '^[0-9]{7}$'),
  address text,
  status public.coverage_request_status not null default 'aberto',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger coverage_requests_set_updated_at
  before update on public.coverage_requests
  for each row execute function public.set_updated_at();

-- Auditoria ----------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'geom' - 'centroid' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'geom' - 'centroid' end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, old_data, new_data)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'land_id')::uuid,
    v_old,
    v_new
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'municipalities', 'legal_documents', 'zones', 'zoning_rules', 'rule_sources',
    'environmental_layers', 'lands', 'land_owner_contacts', 'cub_values',
    'market_comparables', 'market_indicators'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
      t || '_audit', t);
  end loop;
end;
$$;

-- RLS -----------------------------------------------------------------------------

alter table public.feasibility_defaults enable row level security;
alter table public.risk_weights enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.reports enable row level security;
alter table public.report_versions enable row level security;
alter table public.analyst_reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.coverage_requests enable row level security;
alter table public.audit_log enable row level security;

-- Defaults e pesos: leitura geral, escrita admin.
do $$
declare
  t text;
begin
  foreach t in array array['feasibility_defaults', 'risk_weights'] loop
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

-- Execuções do motor: da organização; imutáveis.
create policy "analysis_runs: organização e admin leem" on public.analysis_runs
  for select to authenticated
  using (organization_id in (select private.user_org_ids()) or (select private.is_admin()));
create policy "analysis_runs: membro registra na própria organização" on public.analysis_runs
  for insert to authenticated
  with check (
    organization_id in (select private.user_org_ids()) and created_by = (select auth.uid())
  );

-- Relatórios: da organização.
create policy "reports: organização e admin leem" on public.reports
  for select to authenticated
  using (organization_id in (select private.user_org_ids()) or (select private.is_admin()));
create policy "reports: membro cria na própria organização" on public.reports
  for insert to authenticated
  with check (
    organization_id in (select private.user_org_ids()) and created_by = (select auth.uid())
  );
create policy "reports: organização atualiza" on public.reports
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));
create policy "reports: organização remove" on public.reports
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy "report_versions: conforme o relatório" on public.report_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.reports r
       where r.id = report_id
         and (r.organization_id in (select private.user_org_ids()) or (select private.is_admin()))
    )
  );
create policy "report_versions: organização cria" on public.report_versions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.reports r
       where r.id = report_id and r.organization_id in (select private.user_org_ids())
    )
  );

-- Revisão de analista (loop de calibração).
create policy "analyst_reviews: conforme o relatório" on public.analyst_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.reports r
       where r.id = report_id
         and (r.organization_id in (select private.user_org_ids()) or (select private.is_admin()))
    )
  );
create policy "analyst_reviews: analista ou admin registra" on public.analyst_reviews
  for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and (select private.has_role(array['analista', 'admin']::public.app_role[]))
    and exists (
      select 1 from public.reports r
       where r.id = report_id
         and (r.organization_id in (select private.user_org_ids()) or (select private.is_admin()))
    )
  );

-- Chat: conversas são do usuário.
create policy "conversations: dono gerencia" on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and organization_id in (select private.user_org_ids())
  );

create policy "messages: conforme a conversa" on public.messages
  for select to authenticated
  using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "messages: dono da conversa insere" on public.messages
  for insert to authenticated
  with check (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

create policy "attachments: conforme a conversa" on public.attachments
  for select to authenticated
  using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "attachments: dono da conversa envia" on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "attachments: dono remove" on public.attachments
  for delete to authenticated
  using (uploaded_by = (select auth.uid()));

-- Pedidos de cobertura.
create policy "coverage_requests: organização e admin leem" on public.coverage_requests
  for select to authenticated
  using (organization_id in (select private.user_org_ids()) or (select private.is_admin()));
create policy "coverage_requests: membro pede" on public.coverage_requests
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and organization_id in (select private.user_org_ids())
    and status = 'aberto'
  );
create policy "coverage_requests: admin atualiza" on public.coverage_requests
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Auditoria: só leitura, só admin. Escrita apenas pelo trigger.
create policy "audit_log: admin lê" on public.audit_log
  for select to authenticated using ((select private.is_admin()));

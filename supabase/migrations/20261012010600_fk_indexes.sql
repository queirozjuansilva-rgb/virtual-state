-- Índices para chaves estrangeiras usadas em consultas e cascatas.
-- (Colunas de autoria, como created_by, ficam sem índice de propósito.)
create index analysis_runs_conversation_idx on public.analysis_runs (conversation_id);
create index conversations_org_idx on public.conversations (organization_id);
create index conversations_land_idx on public.conversations (land_id);
create index coverage_requests_org_idx on public.coverage_requests (organization_id, created_at desc);
create index reports_land_idx on public.reports (land_id);
create index reports_analysis_run_idx on public.reports (analysis_run_id);
create index analyst_reviews_version_idx on public.analyst_reviews (report_version_id);
create index attachments_message_idx on public.attachments (message_id);
create index zones_legal_document_idx on public.zones (legal_document_id);
create index environmental_layers_legal_document_idx on public.environmental_layers (legal_document_id);

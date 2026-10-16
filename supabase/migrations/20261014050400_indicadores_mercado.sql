-- Fase 5: indicadores agregados de mercado por bairro (ex.: CPES do
-- Sinduscon-CE) como contexto no copiloto. São médias de preço de tabela, sem
-- microdados nem direito de redistribuição (Blueprint v2.2): nunca viram preço
-- do estudo e não entram no PDF nem no link público.

alter table public.market_indicators
  add column typology public.comparable_typology,
  add column source_page integer check (source_page > 0),
  add column source_url text check (length(source_url) <= 2000),
  add column internal_only boolean not null default true,
  add column notes text check (length(notes) <= 1000);

comment on column public.market_indicators.internal_only is
  'Só para consulta na plataforma: fora de PDF, link público e exportações.';
comment on column public.market_indicators.avg_price_m2 is
  'Preço médio de tabela por m² privativo (não é preço de transação).';

-- IVV de vendas líquidas fica negativo quando os distratos superam as vendas.
alter table public.market_indicators drop constraint market_indicators_vso_pct_check;
alter table public.market_indicators
  add constraint market_indicators_vso_pct_check check (vso_pct between -1 and 1);

-- Reversão da migration 20261019080000 (pendência jurídica / trava da homologação).
--
-- Remove só o que aquela migration criou. Nenhuma regra, fonte, norma, zona ou
-- município é tocado. O audit_log é mantido: guarda quem abriu e quem encerrou a
-- pendência, e auditoria não se apaga.
--
-- Atômica: roda inteira numa transação; qualquer erro desfaz tudo (sem CASCADE,
-- um objeto dependente inesperado faz a reversão falhar em vez de apagá-lo).
-- Idempotente: pode rodar de novo sem efeito.
-- Esta pasta não é lida pela CLI do Supabase (só supabase/migrations e seed.sql).
-- Testes: src/server/admin/pendencia-juridica.test.ts.

begin;

-- 1. Trava (gatilhos nas tabelas existentes).
drop trigger if exists zoning_rules_trava_juridica on public.zoning_rules;
drop trigger if exists rule_sources_trava_juridica on public.rule_sources;

-- 2. Funções (antes das tabelas: pendencias_abertas_para devolve o tipo da tabela).
drop function if exists public.admin_resolver_pendencia_juridica(uuid, text, text, date, text);
drop function if exists private.resolver_pendencia_juridica(uuid, text, text, date, text);
drop function if exists public.alcance_da_pendencia_juridica(uuid);
drop function if exists public.regras_com_bloqueio_juridico(uuid[]);
drop function if exists public.bloqueio_juridico(uuid, uuid[]);
drop function if exists private.trava_homologacao_juridica();
drop function if exists private.pendencias_abertas_para(uuid, uuid[]);
drop function if exists private.normas_da_pendencia(uuid);

-- 3. Tabelas (levam junto índices, políticas e gatilhos próprios) e o tipo.
drop table if exists public.legal_pendency_documents;
drop table if exists public.legal_pendencies;
drop type if exists public.legal_pendency_status;

-- 4. Histórico de migrations do Supabase (aplicada pelo MCP com este nome).
delete from supabase_migrations.schema_migrations where name = 'pendencia_juridica_homologacao';

commit;

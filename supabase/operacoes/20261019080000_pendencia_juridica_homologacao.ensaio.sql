-- Verificação do ensaio da migration 20261019080000 (pendência jurídica).
--
-- Ensaio = a migration inteira dentro de um único DO que termina SEMPRE em
-- exceção (SQLSTATE ENS01): nada do que acontece lá dentro é gravado, inclusive
-- este bloco. Montagem: node supabase/operacoes/ensaio.mts <migration> <este arquivo>.
-- Testado no PGlite em src/server/admin/pendencia-juridica.test.ts.
--
-- Este bloco roda depois da migration, ainda dentro do DO, e preenche v_resumo
-- (declarada no DO). A tentativa de validar a regra da ZOP 1 confere a trava com
-- os dados reais; ela é desfeita junto com todo o resto.

declare
  v_pendencia uuid;
  v_regra uuid;
  v_codigo text;
  v_trava text := 'sem regra de teste';
begin
  select id into v_pendencia from public.legal_pendencies where code = 'vigencia-lc-450-2025';

  select r.id, z.code into v_regra, v_codigo
    from public.zoning_rules r
    join public.zones z on z.id = r.zone_id
    join public.municipalities m on m.id = z.municipality_id
   where m.ibge_code = '2304400'
     and r.status = 'rascunho'
     and exists (
       select 1 from public.rule_sources s join public.legal_documents d on d.id = s.legal_document_id
        where s.zoning_rule_id = r.id and d.number = '62/2009'
     )
   order by (z.code = 'ZOP 1') desc, z.code
   limit 1;

  if v_regra is not null then
    begin
      -- Como a validação real (admin_save_zoning_rule): status e validated_at, que a
      -- restrição zoning_rules_check2 exige para "validado".
      update public.zoning_rules set status = 'validado', validated_at = now() where id = v_regra;
      set constraints all immediate; -- dispara agora a trava adiada
      v_trava := 'NÃO BLOQUEOU ' || v_codigo;
    exception when sqlstate 'VEJ01' then
      v_trava := 'bloqueou ' || v_codigo;
    end;
  end if;

  v_resumo := format(
    'pendencias=%s; normas_ligadas=%s; normas_no_alcance=%s; regras_alcancadas=%s; gatilhos_trava=%s; politicas=%s; validacao_de_teste=%s',
    (select count(*) from public.legal_pendencies),
    (select count(*) from public.legal_pendency_documents),
    (select count(*) from private.normas_da_pendencia(v_pendencia)),
    (select count(*) from public.zoning_rules r
      where r.status <> 'arquivado'
        and exists (
          select 1 from private.pendencias_abertas_para(
            r.zone_id,
            array(select s.legal_document_id from public.rule_sources s where s.zoning_rule_id = r.id)
          )
        )),
    (select count(*) from pg_trigger where tgname in ('zoning_rules_trava_juridica', 'rule_sources_trava_juridica')),
    (select count(*) from pg_policies where tablename in ('legal_pendencies', 'legal_pendency_documents')),
    v_trava
  );
end;

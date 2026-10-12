-- Seed de desenvolvimento: Fortaleza/CE.
--
-- Geografia real; dados urbanísticos, terrenos e comparáveis FICTÍCIOS (is_fictitious).
-- CUB-CE R8-N: valores públicos do Sinduscon-CE (ver notas em cub_values).
-- Idempotente: pode rodar mais de uma vez.

begin;

-- Município --------------------------------------------------------------------

insert into public.municipalities (ibge_code, name, uf, coverage_status, center)
values ('2304400', 'Fortaleza', 'CE', 'em_implantacao',
        extensions.st_setsrid(extensions.st_makepoint(-38.5267, -3.7319), 4326))
on conflict (ibge_code) do nothing;

-- Documento legal fictício -----------------------------------------------------

insert into public.legal_documents (
  municipality_id, kind, number, title, published_on, effective_from, is_fictitious, notes
)
select m.id, 'lei_complementar', '999/2026-TESTE',
       'Lei de Uso e Ocupação do Solo de TESTE (fictícia)',
       date '2026-01-15', date '2026-02-01', true,
       'Documento fictício criado para testes da plataforma. Não corresponde à legislação real de Fortaleza.'
  from public.municipalities m
 where m.ibge_code = '2304400'
   and not exists (
     select 1 from public.legal_documents d
      where d.municipality_id = m.id and d.number = '999/2026-TESTE'
   );

-- Zonas fictícias (faixas sobre bairros reais) ----------------------------------

insert into public.zones (municipality_id, code, name, kind, description, geom, legal_document_id)
select m.id, z.code, z.name, 'zona', z.description,
       extensions.st_multi(extensions.st_makeenvelope(-38.515, z.lat_min, -38.480, z.lat_max, 4326)),
       d.id
  from public.municipalities m
  join public.legal_documents d on d.municipality_id = m.id and d.number = '999/2026-TESTE'
 cross join (values
   ('ZT-1', 'Zona de Teste 1: Orla (fictícia)',
    'Faixa sobre Meireles/Mucuripe. Parâmetros fictícios, só para testes.', -3.732, -3.722),
   ('ZT-2', 'Zona de Teste 2: Adensamento (fictícia)',
    'Faixa sobre Aldeota/Varjota. Parâmetros fictícios, só para testes.', -3.746, -3.732),
   ('ZT-3', 'Zona de Teste 3: Ocupação moderada (fictícia)',
    'Faixa sobre Dionísio Torres/Cocó. Parâmetros fictícios, só para testes.', -3.762, -3.746)
 ) as z (code, name, description, lat_min, lat_max)
 where m.ibge_code = '2304400'
on conflict (municipality_id, code) do nothing;

-- Camada ambiental fictícia (APP) ----------------------------------------------

insert into public.environmental_layers (municipality_id, kind, name, source, geom, is_fictitious)
select m.id, 'app', 'APP de teste: margem fictícia', 'Camada fictícia (seed de desenvolvimento)',
       extensions.st_multi(extensions.st_makeenvelope(-38.4895, -3.7620, -38.4850, -3.7480, 4326)),
       true
  from public.municipalities m
 where m.ibge_code = '2304400'
   and not exists (
     select 1 from public.environmental_layers l
      where l.municipality_id = m.id and l.name = 'APP de teste: margem fictícia'
   );

-- Regras urbanísticas validadas (fictícias) ------------------------------------

with rules (
  zone_code, use_type, permitted, ca_basico, ca_max, to_max, permeabilidade_min,
  gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos,
  lote_minimo_m2, testada_minima_m, outorga_fator
) as (values
  ('ZT-1', 'residencial_vertical',   true,  2.0, 3.0, 0.60, 0.15, 72, 24, '5', 'max(H/10, 3)', 'max(H/10, 3)', 450, 15, 0.30),
  ('ZT-1', 'misto',                  true,  2.0, 3.5, 0.60, 0.15, 72, 24, '5', 'max(H/10, 3)', 'max(H/10, 3)', 450, 15, 0.30),
  ('ZT-1', 'comercial',              true,  2.0, 3.0, 0.70, 0.10, 48, 14, '5', '3', '3', 360, 12, 0.30),
  ('ZT-1', 'residencial_horizontal', false, null, null, null, null, null, null, null, null, null, null, null, null),
  ('ZT-2', 'residencial_vertical',   true,  1.5, 2.5, 0.60, 0.20, 48, 16, '5', 'max(H/12, 2.5)', 'max(H/12, 2.5)', 360, 12, 0.30),
  ('ZT-2', 'misto',                  true,  1.5, 2.5, 0.65, 0.20, 48, 16, '5', 'max(H/12, 2.5)', 'max(H/12, 2.5)', 360, 12, 0.30),
  ('ZT-2', 'comercial',              true,  1.5, 2.0, 0.70, 0.15, 30, 8, '5', '2', '3', 300, 10, 0.30),
  ('ZT-2', 'residencial_horizontal', true,  1.0, 1.0, 0.60, 0.20, 10, 2, '3', '1.5', '3', 250, 10, null),
  ('ZT-3', 'residencial_vertical',   true,  1.0, 1.5, 0.50, 0.30, 24, 8, '5', 'max(H/15, 2)', '3', 450, 15, 0.30),
  ('ZT-3', 'misto',                  true,  1.0, 1.2, 0.55, 0.30, 15, 4, '5', '2', '3', 360, 12, 0.30),
  ('ZT-3', 'residencial_horizontal', true,  0.8, 0.8, 0.50, 0.30, 9, 2, '3', '1.5', '2', 200, 8, null),
  ('ZT-3', 'comercial',              false, null, null, null, null, null, null, null, null, null, null, null, null)
)
insert into public.zoning_rules (
  zone_id, use_type, permitted, ca_basico, ca_max, to_max, permeabilidade_min,
  gabarito_m, gabarito_pavimentos, recuo_frontal, recuo_lateral, recuo_fundos,
  lote_minimo_m2, testada_minima_m, outorga_fator, observacoes, status, validated_at
)
select z.id, r.use_type::public.land_use, r.permitted, r.ca_basico, r.ca_max, r.to_max,
       r.permeabilidade_min, r.gabarito_m, r.gabarito_pavimentos, r.recuo_frontal,
       r.recuo_lateral, r.recuo_fundos, r.lote_minimo_m2, r.testada_minima_m, r.outorga_fator,
       'Regra fictícia (seed). H = altura da edificação em metros.', 'validado', now()
  from rules r
  join public.zones z on z.code = r.zone_code
  join public.municipalities m on m.id = z.municipality_id and m.ibge_code = '2304400'
on conflict (zone_id, use_type) where status = 'validado' do nothing;

-- Fonte de cada campo preenchido (artigo fictício).
insert into public.rule_sources (zoning_rule_id, field, legal_document_id, article, excerpt)
select r.id, f.field, z.legal_document_id,
       'Anexo II, Tabela ' || z.code || ' (fictício)',
       'Trecho fictício para testes: ' || f.field || ' = ' || f.value || ' para ' ||
         r.use_type || ' na ' || z.code || '.'
  from public.zoning_rules r
  join public.zones z on z.id = r.zone_id
  join public.municipalities m on m.id = z.municipality_id and m.ibge_code = '2304400'
 cross join lateral (
   select key as field, value #>> '{}' as value
     from jsonb_each(to_jsonb(r))
    where key in (
      'permitted', 'ca_basico', 'ca_max', 'to_max', 'permeabilidade_min', 'gabarito_m',
      'gabarito_pavimentos', 'recuo_frontal', 'recuo_lateral', 'recuo_fundos',
      'lote_minimo_m2', 'testada_minima_m', 'outorga_fator'
    )
      and value <> 'null'::jsonb
 ) f
 where z.legal_document_id is not null
on conflict (zoning_rule_id, field) do nothing;

-- CUB-CE R8-N (valores públicos, Sinduscon-CE) ---------------------------------
-- TODO(cliente): conferir no boletim oficial do Sinduscon-CE. Coletados em
-- 2026-10-12 de fonte secundária que cita o Sinduscon-CE; os sites oficiais
-- (sinduscon-ce.org.br, cub.org.br) não responderam no momento da coleta.

insert into public.cub_values (uf, reference_month, standard, value_m2, source, source_url, notes)
select 'CE', v.month, 'R8-N', v.value, 'Sinduscon-CE',
       'https://myside.com.br/guia-imoveis/cub-ce',
       'Coletado em 2026-10-12 via myside.com.br (cita Sinduscon-CE). Conferir no boletim oficial.'
  from (values
    (date '2025-09-01', 2163.92),
    (date '2025-10-01', 2205.32),
    (date '2025-11-01', 2252.06),
    (date '2025-12-01', 2275.59),
    (date '2026-01-01', 2276.70),
    (date '2026-02-01', 2284.42),
    (date '2026-03-01', 2326.74),
    (date '2026-04-01', 2364.77),
    (date '2026-05-01', 2397.15),
    (date '2026-06-01', 2400.81),
    (date '2026-07-01', 2426.12),
    (date '2026-08-01', 2458.13)
  ) as v (month, value)
on conflict (uf, reference_month, standard) do nothing;

-- Terrenos fictícios ------------------------------------------------------------
-- Retângulos em metros convertidos para graus a partir do canto sudoeste.

with land_seed (
  code, address, neighborhood, cep, lon0, lat0, width_m, depth_m, status, preco,
  negociacao, permuta_pct, topografia, declividade, esquina, matricula, cartorio,
  testada, observacoes
) as (values
  ('VE-0001', 'Rua de Teste A, 100', 'Meireles', '60165000', -38.5000, -3.7290, 30, 40,
   'disponivel', 4200000, 'dinheiro', null, 'plano', null, true, '12.345', '1º Ofício de Registro de Imóveis (fictício)', 30,
   'Lote de esquina na orla (fictício).'),
  ('VE-0002', 'Rua de Teste B, 220', 'Meireles', '60165010', -38.4920, -3.7275, 25, 36,
   'disponivel', 3100000, 'permuta_fisica', 0.18, 'plano', null, false, '12.346', '1º Ofício de Registro de Imóveis (fictício)', 25,
   'Proprietário aceita permuta física (fictício).'),
  ('VE-0003', 'Av. de Teste C, 1500', 'Aldeota', '60150000', -38.5050, -3.7322, 35, 40,
   'disponivel', 3900000, 'misto', 0.10, 'plano', null, false, '20.001', '2º Ofício de Registro de Imóveis (fictício)', 35,
   'Lote na divisa entre duas zonas (teste de interseção múltipla).'),
  ('VE-0004', 'Rua de Teste D, 800', 'Aldeota', '60150100', -38.4985, -3.7400, 40, 50,
   'disponivel', 5500000, 'misto', 0.10, 'plano', null, true, '20.002', '2º Ofício de Registro de Imóveis (fictício)', 40,
   null),
  ('VE-0005', 'Rua de Teste E, 45', 'Varjota', '60175000', -38.5080, -3.7385, 20, 30,
   'em_negociacao', 1450000, 'dinheiro', null, 'plano', null, false, '20.003', '2º Ofício de Registro de Imóveis (fictício)', 20,
   'Em negociação (visível só para admin).'),
  ('VE-0006', 'Rua de Teste F, 12', 'Aldeota', '60150200', -38.4900, -3.7420, 12, 25,
   'disponivel', 780000, 'dinheiro', null, 'plano', null, false, '20.004', '2º Ofício de Registro de Imóveis (fictício)', 12,
   'Área abaixo do lote mínimo da zona (teste).'),
  ('VE-0007', 'Rua de Teste G, 300', 'Dionísio Torres', '60135000', -38.5020, -3.7530, 30, 45,
   'disponivel', 2600000, 'dinheiro', null, 'aclive', 8, false, null, null, 30,
   'Sem matrícula informada (teste de risco jurídico).'),
  ('VE-0008', 'Av. de Teste H, 2100', 'Cocó', '60192000', -38.4897, -3.7550, 30, 40,
   'disponivel', 2900000, 'permuta_financeira', 0.15, 'declive', 12, false, '31.100', '3º Ofício de Registro de Imóveis (fictício)', 30,
   'Cruza a APP de teste (interseção automática).'),
  ('VE-0009', 'Rua de Teste I, 950', 'Dionísio Torres', '60135100', -38.5100, -3.7590, 50, 60,
   'reservado', 6200000, 'dinheiro', null, 'plano', null, true, '31.101', '3º Ofício de Registro de Imóveis (fictício)', 50,
   'Reservado (visível só para admin).'),
  ('VE-0010', 'Rua de Teste J, 77', 'Centro', '60060000', -38.5300, -3.7400, 25, 30,
   'disponivel', 1200000, 'dinheiro', null, 'plano', null, false, '40.010', '1º Ofício de Registro de Imóveis (fictício)', 25,
   'Fora das zonas de teste: zona precisa ser atribuída à mão.')
)
insert into public.lands (
  code, address, neighborhood, municipality_id, cep, geom, testada_principal_m, topografia,
  declividade_pct, formato, esquina, matricula_numero, cartorio, status, preco_pedido,
  negociacao, permuta_pct, observacoes, is_fictitious
)
select s.code, s.address, s.neighborhood, m.id, s.cep,
       extensions.st_multi(extensions.st_makeenvelope(
         s.lon0, s.lat0,
         s.lon0 + s.width_m / (111320 * cos(radians(s.lat0))),
         s.lat0 + s.depth_m / 110574.0,
         4326)),
       s.testada, s.topografia::public.topography, s.declividade, 'retangular', s.esquina,
       s.matricula, s.cartorio, s.status::public.land_status, s.preco,
       s.negociacao::public.negotiation_type, s.permuta_pct, s.observacoes, true
  from land_seed s
  join public.municipalities m on m.ibge_code = '2304400'
on conflict (code) do nothing;

insert into public.land_owner_contacts (land_id, owner_name, phone, email, notes)
select l.id,
       'Proprietário Exemplo ' || right(l.code, 2),
       '(85) 90000-00' || right(l.code, 2),
       'proprietario' || right(l.code, 2) || '@exemplo.com',
       'Contato fictício (seed).'
  from public.lands l
 where l.is_fictitious and l.code like 'VE-00%'
on conflict (land_id) do nothing;

-- Comparáveis fictícios (30) ----------------------------------------------------
-- Gerados de forma determinística: R$/m² base por zona ±10%.

insert into public.market_comparables (
  municipality_id, neighborhood, address, geom, typology, bedrooms, private_area_m2, price,
  observed_on, kind, source, notes, is_fictitious
)
select m.id,
       (array['Meireles', 'Aldeota', 'Dionísio Torres'])[z + 1],
       'Empreendimento de teste ' || i,
       extensions.st_setsrid(extensions.st_makepoint(
         -38.512 + ((i * 0.0011) - floor(i * 0.0011 / 0.028) * 0.028),
         (array[-3.7300, -3.7390, -3.7540])[z + 1] + ((i % 5) - 2) * 0.0012
       ), 4326),
       case when i % 7 = 0 then 'sala_comercial' else 'apartamento' end::public.comparable_typology,
       case when i % 7 = 0 then 0 else 1 + (i % 4) end,
       area,
       round(area * (array[13500, 11000, 8800])[z + 1] * (1 + (((i * 37) % 21) - 10) / 100.0), -3),
       date '2026-09-01' - ((i * 11) % 300),
       (array['lancamento', 'oferta', 'venda'])[1 + (i % 3)]::public.comparable_kind,
       'Dados fictícios de teste (seed)',
       'Comparável fictício gerado para desenvolvimento.',
       true
  from generate_series(1, 30) as i
 cross join lateral (select i % 3 as z, (60 + (i * 23) % 90)::numeric as area) g
  join public.municipalities m on m.ibge_code = '2304400'
 where not exists (
   select 1 from public.market_comparables c
    where c.is_fictitious and c.address = 'Empreendimento de teste ' || i
 );

commit;

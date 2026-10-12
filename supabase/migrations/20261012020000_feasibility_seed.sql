-- Fase 2: defaults do motor, pesos de risco e busca de comparáveis.
--
-- TODO(cliente): valores usuais de mercado, a calibrar com o Gabriel.
-- Mantenha em sincronia com src/lib/feasibility/defaults.ts (há um teste que
-- confere: src/server/feasibility/config.test.ts).

insert into public.feasibility_defaults (key, value, description, source) values
  ('premissa.usar_ca_maximo', 'false', 'Usar o CA máximo (com outorga onerosa) no estudo', 'Default da plataforma'),
  ('premissa.eficiencia', '0.8', 'Eficiência: área privativa ÷ área computável', 'Valor usual de mercado (a calibrar)'),
  ('premissa.area_nao_computavel_pct', '0.4', 'Área não computável (garagem, áreas comuns) sobre a computável', 'Valor usual de mercado (a calibrar)'),
  ('premissa.equivalencia_nao_computavel', '0.5', 'Coeficiente de equivalência de custo da área não computável', 'Valor usual de mercado (a calibrar)'),
  ('premissa.pe_direito_m', '3', 'Altura por pavimento (m) para converter gabarito e recuos', 'Valor usual de mercado (a calibrar)'),
  ('premissa.fator_cub', '1.3', 'Fator sobre o CUB para itens não inclusos (fundações, elevadores, BDI)', 'Valor usual de mercado (a calibrar)'),
  ('premissa.forma_aquisicao', '"compra"', 'Forma de aquisição padrão quando o terreno não informa', 'Default da plataforma'),
  ('premissa.permuta_pct', '0', 'Percentual de permuta padrão', 'Default da plataforma'),
  ('premissa.itbi_pct', '0.03', 'ITBI sobre o valor de aquisição', 'Valor usual de mercado (a calibrar por município)'),
  ('premissa.registro_pct', '0.01', 'Escritura e registro sobre o valor de aquisição', 'Valor usual de mercado (a calibrar)'),
  ('premissa.projetos_pct', '0.04', 'Projetos e aprovações sobre o custo de obra', 'Valor usual de mercado (a calibrar)'),
  ('premissa.marketing_pct', '0.03', 'Marketing e stand sobre a receita', 'Valor usual de mercado (a calibrar)'),
  ('premissa.corretagem_pct', '0.05', 'Corretagem sobre a receita', 'Valor usual de mercado (a calibrar)'),
  ('premissa.administracao_pct', '0.03', 'Administração sobre o custo de obra', 'Valor usual de mercado (a calibrar)'),
  ('premissa.contingencia_pct', '0.05', 'Contingência sobre o custo de obra', 'Valor usual de mercado (a calibrar)'),
  ('premissa.impostos_pct', '0.04', 'Impostos sobre a receita (RET)', 'Regime Especial de Tributação (a confirmar caso a caso)'),
  ('premissa.prazo_aprovacao_meses', '6', 'Prazo de aprovação (meses)', 'Valor usual de mercado (a calibrar)'),
  ('premissa.prazo_obra_meses', '30', 'Prazo de obra (meses)', 'Valor usual de mercado (a calibrar)'),
  ('premissa.prazo_vendas_meses', '24', 'Prazo de vendas (meses)', 'Valor usual de mercado (a calibrar)'),
  ('premissa.vendas_no_lancamento_pct', '0.3', 'Fração vendida no mês do lançamento', 'Valor usual de mercado (a calibrar)'),
  ('premissa.recebimento_sinal_pct', '0.1', 'Recebimento: sinal no mês da venda', 'Valor usual de mercado (a calibrar)'),
  ('premissa.recebimento_obra_pct', '0.2', 'Recebimento: mensais durante a obra', 'Valor usual de mercado (a calibrar)'),
  ('premissa.recebimento_chaves_pct', '0.7', 'Recebimento: chaves/repasse', 'Valor usual de mercado (a calibrar)'),
  ('premissa.curva_obra', '"s"', 'Curva de desembolso da obra (linear ou s)', 'Default da plataforma'),
  ('premissa.declividade_acentuada_pct', '15', 'Declividade a partir da qual a topografia é acentuada (%)', 'Default da plataforma (a calibrar)'),
  ('premissa.n_minimo_comparaveis', '5', 'Mínimo de comparáveis para o preço sugerido', 'Default da plataforma (a calibrar)'),
  ('premissa.cv_maximo_comparaveis', '0.2', 'Coeficiente de variação máximo dos comparáveis', 'Default da plataforma (a calibrar)'),
  ('premissa.margem_minima_conservador', '0.12', 'Margem mínima sobre o VGV no cenário conservador', 'Default da plataforma (a calibrar)'),
  ('cenario.conservador.preco', '-0.1', 'Cenário conservador: variação do preço de venda', 'Default da plataforma (a calibrar)'),
  ('cenario.conservador.custo', '0.1', 'Cenário conservador: variação do custo de obra', 'Default da plataforma (a calibrar)'),
  ('cenario.conservador.prazo_vendas', '0.5', 'Cenário conservador: variação do prazo de vendas', 'Default da plataforma (a calibrar)'),
  ('cenario.otimista.preco', '0.05', 'Cenário otimista: variação do preço de venda', 'Default da plataforma (a calibrar)'),
  ('cenario.otimista.custo', '-0.05', 'Cenário otimista: variação do custo de obra', 'Default da plataforma (a calibrar)'),
  ('cenario.otimista.prazo_vendas', '-0.25', 'Cenário otimista: variação do prazo de vendas', 'Default da plataforma (a calibrar)'),
  ('risco.limiar_medio', '25', 'Score a partir do qual o risco é Médio', 'Default da plataforma (a calibrar)'),
  ('risco.limiar_alto', '50', 'Score a partir do qual o risco é Alto', 'Default da plataforma (a calibrar)'),
  ('mercado.raio_m', '1500', 'Raio de busca dos comparáveis (m)', 'Default da plataforma (a calibrar)'),
  ('mercado.janela_meses', '24', 'Janela de data dos comparáveis (meses)', 'Default da plataforma (a calibrar)')
on conflict (key) do nothing;

insert into public.risk_weights (flag_code, axis, weight, label) values
  ('regra_nao_validada', 'urbanistico', 30, 'Sem regra urbanística validada para o uso'),
  ('uso_nao_permitido', 'urbanistico', 40, 'Uso não permitido na zona'),
  ('parametro_ausente', 'urbanistico', 15, 'Parâmetro urbanístico não validado'),
  ('zona_nao_identificada', 'urbanistico', 25, 'Zona não identificada'),
  ('zona_atribuida_manualmente', 'urbanistico', 10, 'Zona atribuída manualmente'),
  ('lote_multiplas_zonas', 'urbanistico', 10, 'Lote em mais de uma zona'),
  ('restricao_app', 'fisico', 25, 'Interseção com APP'),
  ('restricao_alagavel', 'fisico', 25, 'Área alagável'),
  ('restricao_ambiental_outra', 'fisico', 15, 'Outra restrição físico-ambiental'),
  ('topografia_acentuada', 'fisico', 10, 'Topografia acentuada'),
  ('area_abaixo_minimo', 'fisico', 20, 'Área abaixo do lote mínimo'),
  ('testada_abaixo_minimo', 'fisico', 15, 'Testada abaixo da mínima'),
  ('testada_estimada', 'fisico', 5, 'Testada não informada (geometria estimada)'),
  ('matricula_ausente', 'juridico', 20, 'Matrícula não informada'),
  ('onus_registrado', 'juridico', 15, 'Ônus registrado'),
  ('comparaveis_insuficientes', 'mercado', 15, 'Poucos comparáveis de mercado'),
  ('dispersao_preco_alta', 'mercado', 10, 'Alta dispersão de preços'),
  ('margem_conservadora_baixa', 'mercado', 20, 'Margem baixa no cenário conservador')
on conflict (flag_code) do nothing;

-- Comparáveis num raio do centroide do lote, por tipologia e janela de data.
create function public.comparables_near_land(
  p_land_id uuid,
  p_typology public.comparable_typology,
  p_radius_m integer,
  p_since date
)
returns table (
  id uuid,
  price_m2 numeric,
  observed_on date,
  distance_m numeric,
  is_fictitious boolean
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.price_m2, c.observed_on,
         round(extensions.st_distance(c.geom::extensions.geography, l.centroid::extensions.geography)::numeric, 1),
         c.is_fictitious
    from public.lands l
    join public.market_comparables c on c.municipality_id = l.municipality_id
   where l.id = p_land_id
     and l.centroid is not null
     and c.typology = p_typology
     and c.observed_on >= p_since
     and extensions.st_dwithin(c.geom::extensions.geography, l.centroid::extensions.geography, p_radius_m)
   order by 4
$$;

revoke execute on function public.comparables_near_land(uuid, public.comparable_typology, integer, date)
  from public, anon;
grant execute on function public.comparables_near_land(uuid, public.comparable_typology, integer, date)
  to authenticated;

-- Fase 1: funções de escrita do painel admin.
-- Motivos: (1) geometria precisa entrar por st_geomfromgeojson (SRID 4326; o
-- cast direto de texto GeoJSON gera SRID 0); (2) regra + fontes e terreno +
-- contato do proprietário são gravados atomicamente.
-- SECURITY INVOKER: a RLS continua valendo; o teste de admin é só fail-fast.

create function private.geojson_to_multipolygon(p_geojson jsonb)
returns extensions.geometry
language sql
immutable
set search_path = ''
as $$
  select case
    when p_geojson is null or p_geojson = 'null'::jsonb then null
    else extensions.st_multi(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)
    )
  end
$$;

grant execute on function private.geojson_to_multipolygon(jsonb) to authenticated;

-- Zona ----------------------------------------------------------------------------

create function public.admin_save_zone(
  p_id uuid,
  p_data jsonb,
  p_geojson jsonb,
  p_replace_geometry boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.zones (municipality_id, code, name, kind, description, legal_document_id, geom)
    values (
      (p_data ->> 'municipality_id')::uuid,
      p_data ->> 'code',
      p_data ->> 'name',
      (p_data ->> 'kind')::public.zone_kind,
      p_data ->> 'description',
      (p_data ->> 'legal_document_id')::uuid,
      private.geojson_to_multipolygon(p_geojson)
    )
    returning id into v_id;
  else
    update public.zones
       set code = p_data ->> 'code',
           name = p_data ->> 'name',
           kind = (p_data ->> 'kind')::public.zone_kind,
           description = p_data ->> 'description',
           legal_document_id = (p_data ->> 'legal_document_id')::uuid,
           geom = case when p_replace_geometry then private.geojson_to_multipolygon(p_geojson) else geom end
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Zona não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- Regra urbanística + fontes por campo ----------------------------------------------

create function public.admin_save_zoning_rule(
  p_id uuid,
  p_zone_id uuid,
  p_data jsonb,
  p_sources jsonb,
  p_validate boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_use public.land_use := (p_data ->> 'use_type')::public.land_use;
  v_status public.rule_status := case when p_validate then 'validado' else 'rascunho' end;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  -- Uma nova validação substitui a anterior, que fica arquivada (histórico).
  if p_validate then
    update public.zoning_rules
       set status = 'arquivado'
     where zone_id = p_zone_id and use_type = v_use and status = 'validado'
       and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.zoning_rules (zone_id, use_type, status) values (p_zone_id, v_use, 'rascunho')
    returning id into v_id;
  else
    v_id := p_id;
  end if;

  update public.zoning_rules
     set use_type = v_use,
         use_label_local = p_data ->> 'use_label_local',
         permitted = (p_data ->> 'permitted')::boolean,
         ca_min = (p_data ->> 'ca_min')::numeric,
         ca_basico = (p_data ->> 'ca_basico')::numeric,
         ca_max = (p_data ->> 'ca_max')::numeric,
         to_max = (p_data ->> 'to_max')::numeric,
         permeabilidade_min = (p_data ->> 'permeabilidade_min')::numeric,
         gabarito_m = (p_data ->> 'gabarito_m')::numeric,
         gabarito_pavimentos = (p_data ->> 'gabarito_pavimentos')::integer,
         recuo_frontal = p_data ->> 'recuo_frontal',
         recuo_lateral = p_data ->> 'recuo_lateral',
         recuo_fundos = p_data ->> 'recuo_fundos',
         lote_minimo_m2 = (p_data ->> 'lote_minimo_m2')::numeric,
         testada_minima_m = (p_data ->> 'testada_minima_m')::numeric,
         outorga_fator = (p_data ->> 'outorga_fator')::numeric,
         outorga_formula = p_data ->> 'outorga_formula',
         observacoes = p_data ->> 'observacoes',
         status = v_status,
         validated_at = case when p_validate then now() else null end,
         validated_by = case when p_validate then (select auth.uid()) else null end
   where id = v_id and zone_id = p_zone_id;

  if not found then
    raise exception 'Regra não encontrada.' using errcode = 'P0002';
  end if;

  delete from public.rule_sources where zoning_rule_id = v_id;
  insert into public.rule_sources (zoning_rule_id, field, legal_document_id, article, excerpt)
  select v_id, s ->> 'field', (s ->> 'legal_document_id')::uuid, s ->> 'article',
         nullif(s ->> 'excerpt', '')
    from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) s;

  return v_id;
end;
$$;

-- Terreno + contato do proprietário -----------------------------------------------

create function public.admin_save_land(
  p_id uuid,
  p_data jsonb,
  p_geojson jsonb,
  p_owner jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  r public.lands;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  r := jsonb_populate_record(null::public.lands, p_data);

  if p_id is null then
    insert into public.lands (
      code, address, neighborhood, municipality_id, cep, geom, area_informada_m2,
      testada_principal_m, topografia, declividade_pct, formato, esquina,
      matricula_numero, cartorio, onus, status, preco_pedido, negociacao, permuta_pct,
      zone_id, zone_assignment, tem_app, tem_area_alagavel, tem_faixa_dominio,
      tem_tombamento, tem_servidao, restricoes_obs, observacoes
    ) values (
      r.code, r.address, r.neighborhood, r.municipality_id, r.cep,
      private.geojson_to_multipolygon(p_geojson), r.area_informada_m2,
      r.testada_principal_m, r.topografia, r.declividade_pct, r.formato, r.esquina,
      r.matricula_numero, r.cartorio, r.onus, r.status, r.preco_pedido, r.negociacao,
      r.permuta_pct, r.zone_id, r.zone_assignment, r.tem_app, r.tem_area_alagavel,
      r.tem_faixa_dominio, r.tem_tombamento, r.tem_servidao, r.restricoes_obs, r.observacoes
    )
    returning id into v_id;
  else
    update public.lands
       set code = r.code, address = r.address, neighborhood = r.neighborhood,
           municipality_id = r.municipality_id, cep = r.cep,
           geom = private.geojson_to_multipolygon(p_geojson),
           area_informada_m2 = r.area_informada_m2, testada_principal_m = r.testada_principal_m,
           topografia = r.topografia, declividade_pct = r.declividade_pct, formato = r.formato,
           esquina = r.esquina, matricula_numero = r.matricula_numero, cartorio = r.cartorio,
           onus = r.onus, status = r.status, preco_pedido = r.preco_pedido,
           negociacao = r.negociacao, permuta_pct = r.permuta_pct, zone_id = r.zone_id,
           zone_assignment = r.zone_assignment, tem_app = r.tem_app,
           tem_area_alagavel = r.tem_area_alagavel, tem_faixa_dominio = r.tem_faixa_dominio,
           tem_tombamento = r.tem_tombamento, tem_servidao = r.tem_servidao,
           restricoes_obs = r.restricoes_obs, observacoes = r.observacoes
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Terreno não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  if p_owner is not null and p_owner <> 'null'::jsonb then
    insert into public.land_owner_contacts (land_id, owner_name, phone, email, notes)
    values (v_id, p_owner ->> 'owner_name', p_owner ->> 'phone', p_owner ->> 'email', p_owner ->> 'notes')
    on conflict (land_id) do update
      set owner_name = excluded.owner_name, phone = excluded.phone,
          email = excluded.email, notes = excluded.notes;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_save_zone(uuid, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.admin_save_zoning_rule(uuid, uuid, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.admin_save_land(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_save_zone(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.admin_save_zoning_rule(uuid, uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.admin_save_land(uuid, jsonb, jsonb, jsonb) to authenticated;

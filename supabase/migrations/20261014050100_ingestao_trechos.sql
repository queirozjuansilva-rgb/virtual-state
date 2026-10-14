-- Fase 5: seção do trecho e gravação em lote de trechos e embeddings (ADR 0011).

-- Seção da lei onde o trecho está ("Seção II: Da Zona de Ocupação Preferencial 1").
alter table public.legal_chunks add column section text check (length(section) <= 300);

-- Troca todos os trechos de um documento numa transação (refazer a divisão
-- não deixa o documento pela metade se algo falhar no meio).
create function public.admin_substituir_trechos(p_document_id uuid, p_trechos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  delete from public.legal_chunks where legal_document_id = p_document_id;

  insert into public.legal_chunks (
    legal_document_id, chunk_index, article, section, content, page_start, page_end
  )
  select p_document_id,
         (t ->> 'indice')::integer,
         nullif(t ->> 'artigo', ''),
         nullif(t ->> 'secao', ''),
         t ->> 'conteudo',
         (t ->> 'paginaInicio')::integer,
         (t ->> 'paginaFim')::integer
    from jsonb_array_elements(p_trechos) t;
  get diagnostics v_total = row_count;

  update public.legal_documents
     set ingestion_status = 'fragmentado', ingestion_error = null, ingestion_updated_at = now()
   where id = p_document_id;

  return v_total;
end;
$$;

-- Grava embeddings de vários trechos de uma vez: [{"id": ..., "embedding": "[...]"}].
create function public.admin_gravar_embeddings(p_itens jsonb, p_modelo text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;

  update public.legal_chunks c
     set embedding = (i ->> 'embedding')::extensions.vector,
         embedding_model = p_modelo
    from jsonb_array_elements(p_itens) i
   where c.id = (i ->> 'id')::uuid;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.admin_substituir_trechos(uuid, jsonb) from public, anon;
revoke execute on function public.admin_gravar_embeddings(jsonb, text) from public, anon;
grant execute on function public.admin_substituir_trechos(uuid, jsonb) to authenticated;
grant execute on function public.admin_gravar_embeddings(jsonb, text) to authenticated;

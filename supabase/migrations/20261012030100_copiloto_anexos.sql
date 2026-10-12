-- Fase 3: anexo enviado antes da mensagem é ligado a ela depois (message_id).
-- O usuário só pode alterar message_id; provider_file_id e o resto ficam como
-- o servidor gravou.

revoke update on public.attachments from authenticated;
grant update (message_id) on public.attachments to authenticated;

create policy "attachments: dono liga à mensagem" on public.attachments
  for update to authenticated
  using (uploaded_by = (select auth.uid()))
  with check (
    uploaded_by = (select auth.uid())
    and (
      message_id is null
      or exists (select 1 from public.messages m
                  where m.id = message_id and m.conversation_id = attachments.conversation_id)
    )
  );

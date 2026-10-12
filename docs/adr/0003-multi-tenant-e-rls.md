# ADR 0003: Multi-tenant e RLS

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto

Cada organização (incorporadora, construtora, investidor) só pode ver as próprias análises. O land bank tem visibilidade controlada e o contato do proprietário é só do admin. Decisões do cliente: cadastro aberto e, por enquanto, um usuário por organização.

## Decisão

- **Papéis globais** em `profiles.role` (`admin | analista | membro | proprietario`). `admin` é o time virtual.estate/Lugh.
- **Organização** em `organizations` + `memberships(organization_id, user_id, is_owner)`. Um índice único em `memberships(user_id)` garante uma organização por usuário; removê-lo libera várias, sem mudar o resto do modelo.
- No cadastro, o trigger `handle_new_user` cria o perfil, uma organização pessoal e o vínculo.
- **Helpers de RLS no schema `private`** (não exposto pela API REST): `is_admin()`, `has_role()`, `user_org_ids()`, `current_org_id()`. São `SECURITY DEFINER` com `search_path = ''`.
- **Padrões de política** (uma política permissiva por ação, para não duplicar avaliação):
  - Base normativa e mercado (municípios, leis, zonas, camadas, CUB, comparáveis): leitura para todo usuário logado; escrita só admin.
  - `zoning_rules`/`rule_sources`: fora do admin, **só regras `validado`** são visíveis (princípio 2 do PRD).
  - `lands`: membros veem só `status = 'disponivel'`; admin vê todos. `// TODO(cliente)` (pendência 4).
  - `land_owner_contacts` e `land_documents`: só admin.
  - Análises, relatórios, chat e pedidos de cobertura: por organização (`organization_id in private.user_org_ids()`), com `default private.current_org_id()` nas colunas.
  - `audit_log`: só leitura admin; escrita apenas pelo trigger `private.audit_row()`.
- **Escrita do admin** com geometria ou em mais de uma tabela passa por funções `public.admin_save_*` em `SECURITY INVOKER`: a RLS continua valendo e a função só garante atomicidade e a conversão GeoJSON → SRID 4326.

## Consequências

- Verificado com usuário simulado: membro vê 8 terrenos (disponíveis), 0 contatos e 0 registros de auditoria; admin vê tudo.
- Toda tabela nova precisa de RLS e entra no Supabase advisor sem avisos.
- O app também checa o papel (`requireAdmin`) antes de consultar: defesa em profundidade, não substitui a RLS.

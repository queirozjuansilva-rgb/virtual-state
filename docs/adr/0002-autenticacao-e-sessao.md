# ADR 0002: Autenticação e sessão

- **Status:** aceita
- **Data:** 2026-10-11

## Contexto

O PRD pede "Auth (e-mail + magic link)". O cliente decidiu cadastro aberto no MVP. O Next.js 16 vem com Cache Components ligado: leitura de cookies não pode acontecer fora de `<Suspense>` e o `middleware` virou `proxy`.

## Decisão

- **Supabase Auth** com `@supabase/ssr` (sessão em cookies).
- Duas formas de entrar: **e-mail + senha** e **magic link** (link por e-mail, sem senha; também cria a conta, já que o cadastro é aberto).
- `src/proxy.ts` renova a sessão a cada navegação (`getClaims`) e redireciona quem não tem sessão para `/login`. É uma checagem otimista; a autorização de verdade fica perto dos dados: **DAL** (`src/lib/auth/dal.ts`) + **RLS** no Postgres.
- `/auth/callback` aceita os dois formatos de link do Supabase (`?code=` PKCE e `?token_hash=&type=`).
- Parâmetro `next` só aceita caminhos internos (`safeNextPath`), contra open redirect.
- O papel (`admin | analista | membro | proprietario`) fica em `public.profiles.role`, criado por trigger no cadastro. O usuário só pode alterar o próprio `full_name` (privilégio de coluna); o papel é gerido pelo admin.
- Mantemos Cache Components ligado (será o padrão na próxima major): componentes que leem o usuário ficam dentro de `<Suspense>`.

## Consequências

- **SMTP:** o SMTP padrão do Supabase só envia para membros do time do projeto e tem limite baixo por hora. Serve para desenvolvimento. Antes de liberar para os engenheiros parceiros, configurar SMTP próprio (ex.: Resend) em _Auth → SMTP Settings_.
- **Magic link e PKCE:** o link precisa ser aberto no mesmo navegador em que foi pedido (o verificador PKCE fica em cookie). A tela avisa isso.
- **URLs de redirecionamento:** cada domínio (localhost, previews da Vercel, produção) precisa estar em _Auth → URL Configuration → Redirect URLs_.

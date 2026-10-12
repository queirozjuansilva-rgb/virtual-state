@AGENTS.md

# virtual.estate

Leia `docs/PRD.md` antes de qualquer trabalho de produto. ADRs em `docs/adr/`.

## Regras do projeto

- **O LLM nunca calcula números nem inventa parâmetro urbanístico.** Cálculo vem de `src/lib/feasibility` (puro, testado); parâmetros vêm só de regras com `status = 'validado'`.
- Todo número carrega a **fonte**. Todo relatório traz o disclaimer de estudo preliminar.
- `src/lib/feasibility` e `src/lib/formula`: TypeScript puro, sem imports de framework/banco/IA (o lint bloqueia). Nada de `eval`/`new Function`.
- Suba `ENGINE_VERSION` (`src/lib/feasibility/version.ts`) a cada mudança que altere números.
- Zod em toda fronteira (forms, actions, tools, APIs, saída de IA).
- RLS em todas as tabelas. Migrations em `supabase/migrations/` (SQL versionado); depois de mudar o schema, regenere `src/lib/supabase/database.types.ts`.
- UI 100% em pt-BR, R$ e m². Ícones: lucide-react.
- Cache Components está ligado: leitura de sessão/cookies/searchParams fica dentro de `<Suspense>`. Use `getCurrentUser()`/`requireUser()` de `src/lib/auth/dal.ts`.
- Regras de negócio sem definição do cliente: use um default razoável e marque `// TODO(cliente):`.
- Antes de instalar dependência nova, justifique em uma linha.
- Branches: `feature/*` → `dev` → `main`. Antes de concluir: `npm run lint && npm run typecheck && npm test`.

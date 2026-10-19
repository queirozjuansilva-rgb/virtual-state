@AGENTS.md

# virtual.estate

Leia `docs/PRD.md` antes de qualquer trabalho de produto. ADRs em `docs/adr/`.

## Regras do projeto

- **O LLM nunca calcula números nem inventa parâmetro urbanístico.** Cálculo vem de `src/lib/feasibility` (puro, testado); parâmetros vêm só de regras com `status = 'validado'`.
- Todo número carrega a **fonte**. Todo relatório traz o disclaimer de estudo preliminar.
- `src/lib/feasibility` e `src/lib/formula`: TypeScript puro, sem imports de framework/banco/IA (o lint bloqueia). Nada de `eval`/`new Function`.
- Suba `ENGINE_VERSION` (`src/lib/feasibility/version.ts`) a cada mudança que altere números e refaça os casos de conferência (`docs/validacao/`, com cálculo independente em Python e teste que exige igualdade).
- Métricas e fórmulas do motor: ADR 0007; score de risco: ADR 0008. Defaults ficam em `src/lib/feasibility/defaults.ts` **e** em `feasibility_defaults` (um teste exige que estejam iguais).
- Zod em toda fronteira (forms, actions, tools, APIs, saída de IA).
- RLS em todas as tabelas. Migrations em `supabase/migrations/` (SQL versionado); depois de mudar o schema, regenere `src/lib/supabase/database.types.ts`.
- UI 100% em pt-BR, R$ e m². Ícones: lucide-react.
- Cache Components está ligado: leitura de sessão/cookies/searchParams fica dentro de `<Suspense>`. Use `getCurrentUser()`/`requireUser()` de `src/lib/auth/dal.ts`.
- Regras de negócio sem definição do cliente: use um default razoável e marque `// TODO(cliente):`.
- Antes de instalar dependência nova, justifique em uma linha.
- Banco: tabelas e colunas genéricas em inglês; parâmetros urbanísticos com o nome técnico em português (`ca_basico`, `to_max`, `recuo_frontal`). Enums em pt-BR sem acento; rótulos em `src/lib/domain/labels.ts`.
- Geometria entra sempre por função SQL com `ST_GeomFromGeoJSON` (o cast direto de GeoJSON gera SRID 0). Leitura pela coluna gerada `geojson`.
- Escritas do admin que tocam geometria ou várias tabelas: funções `public.admin_save_*` (SECURITY INVOKER). Helpers de RLS ficam no schema `private`.
- Formulários: Server Action + Zod (`src/lib/forms`) + `useFormAction` (não reseta o form em erro). Números em pt-BR via `parseDecimal`; percentuais digitados 0–100 e gravados 0–1.
- Páginas com dados ficam dentro de `<Suspense>` na própria página (validação de navegação instantânea do Next 16). O cliente Supabase do servidor chama `connection()`.
- Consultas Supabase: use os helpers `rows`/`maybeRow` de `src/server/admin/queries.ts` (um genérico `{ data: T }` no parâmetro faz o TS inferir `never`).
- Mapa: MapLibre + terra-draw em `src/components/map`; o worker vem de `public/vendor` (copiado no `postinstall`).
- Copiloto (ADR 0009): ferramentas em `src/lib/ai/tools` (zod + `DadosCopiloto`, nunca Supabase direto), prompt versionado em `src/lib/ai/prompts/copiloto.vN.md` (mudou o texto → nova versão + `npm run evals`). Histórico append-only: nunca edite mensagens gravadas nem mude prompt/ferramentas no meio da conversa. Se o seed mudar, regenere `src/lib/ai/evals/fixture/seed.json`.
- Chave da Anthropic só no servidor (`ANTHROPIC_API_KEY`); nunca em `NEXT_PUBLIC_*`.
- Relatório (ADR 0010): lógica pura em `src/lib/relatorio` (campos editáveis, seções, gráfico, modelo do PDF); página, link público e PDF usam as mesmas seções. Salvar versão sempre recalcula no servidor (o cliente só manda edições). PDF com `@react-pdf/renderer`: não ponha `lineHeight` na `Page` (some com o nº da página) e agrupe título + cabeçalho + 1ª linha de tabela num bloco `wrap={false}`.
- Ingestão normativa (ADR 0011): lógica pura e testada em `src/lib/legislacao`, servidor em `src/server/legislacao`, prompts versionados em `prompts.ts` (mudou o texto → nova versão). A IA só cria rascunhos; validar regra exige nota de homologação. Arquivo `"use server"` só exporta funções async (exportar constante quebra o módulo).
- O banco corta instruções em 8 s: escritas em lote do admin vão em lotes pequenos (uma zona por chamada; ~800 KB por lote de camada).
- Dados arquivados (`archived_at`) saem de toda consulta: função espacial, busca ou ferramenta nova filtra `archived_at is null`.
- Indicadores agregados de mercado (`market_indicators`, ex.: CPES) são só contexto: nunca entram na entrada do motor, no relatório, no PDF ou no link público.
- O fixture dos evals (`src/lib/ai/evals/fixture/seed.json`) é um retrato do seed fictício; dados públicos carregados direto no banco não entram nele.
- Branches: `feature/*` → `dev` → `main`. Antes de concluir: `npm run lint && npm run typecheck && npm test`.

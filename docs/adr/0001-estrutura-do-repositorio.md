# ADR 0001: Estrutura do repositório

- **Status:** aceita
- **Data:** 2026-10-11

## Contexto

O PRD pede o motor de viabilidade como "pacote isolado (`packages/feasibility` ou `lib/feasibility`), função pura". Um monorepo com workspaces garante isolamento pelo grafo de dependências, mas acrescenta configuração (workspaces, build do pacote, Vercel apontando para `apps/web`) para um time pequeno e um único app.

## Decisão

App Next.js único, com o motor em `src/lib/feasibility` e a DSL de fórmulas em `src/lib/formula`. A pureza é garantida por regra de lint (`eslint.config.mjs`):

- `no-restricted-imports` bloqueia `next`, `react`, `@supabase/*`, `@anthropic-ai/*` e o alias `@/*` dentro dessas pastas (só imports relativos).
- `fetch`, `eval`, `Math.random` e `Date.now` proibidos ali: o motor é determinístico e recebe datas como input.

Estrutura:

```
src/
  app/            rotas (App Router); (auth) e (app) são grupos de rota
  components/     ui/ (shadcn), layout/, auth/, theme/, brand/ …
  lib/
    feasibility/  motor puro + ENGINE_VERSION
    formula/      DSL segura de fórmulas urbanísticas (Fase 1/2)
    ai/           prompts versionados, tools, evals (Fase 3)
    supabase/     clientes (browser, server, proxy) + tipos gerados
    auth/         DAL, schemas Zod, papéis
  proxy.ts        renova a sessão do Supabase (o antigo middleware)
supabase/         config.toml, migrations/, seed
docs/             PRD, mockups, pitch, ADRs, validação
```

## Consequências

- Um só `package.json`, deploy direto na Vercel.
- Se o motor precisar ser publicado/reusado fora do app, a pasta já é autocontida e vira pacote sem refatoração.
- A cobertura de 90% é medida por pasta (`vitest --coverage` com `include`).

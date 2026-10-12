# virtual.estate

Copiloto de inteligência para **triagem técnica de terrenos** e **estudo de viabilidade preliminar**, para incorporadoras, construtoras e investidores.

> Estudo preliminar automatizado. Não substitui análise técnica, jurídica e de due diligence por profissional habilitado.

- Especificação: [`docs/PRD.md`](docs/PRD.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/)
- Referências visuais: [`docs/mockups/`](docs/mockups/) e [`docs/pitch.pdf`](docs/pitch.pdf)

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, PostGIS, pgvector, Auth, Storage, RLS) · Anthropic SDK · Vercel.

## Rodando localmente

Requisitos: Node 22+ (recomendado 24) e npm.

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do projeto Supabase de dev
npm run dev                  # http://localhost:3000
```

O banco de desenvolvimento é um projeto Supabase na nuvem (`virtual-estate-dev`). Não é preciso Docker.

## Scripts

| Comando                 | O que faz                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento                                            |
| `npm run build`         | Build de produção                                                      |
| `npm run lint`          | ESLint                                                                 |
| `npm run typecheck`     | Gera os tipos de rota do Next e roda `tsc`                             |
| `npm test`              | Testes (Vitest)                                                        |
| `npm run test:coverage` | Testes com cobertura                                                   |
| `npm run format`        | Prettier                                                               |
| `npm run db:types`      | Regenera `src/lib/supabase/database.types.ts` (exige `supabase login`) |

## Banco de dados

Migrations em `supabase/migrations/`. Para aplicar no projeto remoto:

```bash
npx supabase login
npx supabase link --project-ref jmubvttvyaepdqlbhkdq
npx supabase db push
```

## Fluxo de branches

`feature/<fase-ou-tema>` → `dev` → `main`. CI (lint, typecheck, testes, build) roda em todo push e PR.

# PRD: virtual.estate (MVP)

> Documento mestre do MVP. Mockups em `docs/mockups/` e pitch em `docs/pitch.pdf`.
> Decisões tomadas depois da escrita deste PRD ficam em [Decisões registradas](#decisões-registradas) e em `docs/adr/`.

## Papel

Engenheiro full-stack líder do MVP da **virtual.estate**, construído pela Lugh. Domínio de Next.js, Supabase/PostGIS, integração com LLMs via tool use e da lógica de **estudo de viabilidade imobiliária no Brasil** (incorporação, VGV, CUB, coeficiente de aproveitamento, taxa de ocupação, recuos, gabarito, outorga onerosa, RET).

Trabalho em fases, com entregas pequenas e verificáveis. Antes de cada fase, um plano curto aguardando aprovação. Regra de negócio ambígua: **perguntar**, não inventar.

## Contexto do produto

**O que é:** plataforma para incorporadoras, construtoras e investidores que automatiza a **triagem técnica de terrenos** e o **estudo de viabilidade preliminar**. O que hoje leva dias deve levar segundos.

**O problema:** dados espalhados em dezenas de portais, PDFs de prefeitura e documentos privados. Semanas perdidas em due diligence de terrenos inviáveis. Risco geológico e jurídico escondido porque ninguém cruza os dados.

**Posicionamento:** "copiloto de inteligência". **Não substitui o veredito do profissional, automatiza a triagem.** Esse princípio governa toda a UX e todo o comportamento da IA: cada número tem origem rastreável e cada conclusão deixa claro que é preliminar.

**Fluxo de inteligência (pitch):**

1. **Land Bank:** banco de terrenos exclusivos, captados direto com os proprietários.
2. **Mapeamento integrado:** zoneamento urbano, leis municipais e métricas de mercado.
3. **Chat de recomendação:** IA que cruza o perfil do investidor com o terreno ideal.
4. **Relatório de viabilidade:** interativo, com cenários e exportação em PDF.

**Análise multidimensional:** todo terreno é avaliado em 3 eixos: **Mercadológico**, **Urbanístico** e **Físico**.

**Roadmap:** curto prazo, MVP + validação de precisão com engenheiros parceiros (**este escopo**). Médio prazo, lançamento oficial. Longo prazo, marketplace de terrenos com due diligence nativa (**fora de escopo**, mas o modelo de dados não pode impedir).

**Time do cliente:** Gabriel Santabaia (economista, dono das regras de viabilidade) e Pedro Catunda (desenvolvedor). Quem constrói é a Lugh.

## Decisões já tomadas

- **Ferramenta:** Claude Code, repositório próprio.
- **Abrangência geográfica:** **Brasil, genérico.** Nenhum município pré-carregado no código. **Motor de regras urbanísticas configurável por município**; municípios entram como dados (cadastro + ingestão de leis).
- **Profundidade:** **funcional, com IA real**: LLM de verdade, cálculo de viabilidade real e land bank cadastrado por painel admin.
- **Stack:** Next.js (App Router) + TypeScript strict + TailwindCSS + shadcn/ui · Supabase (Postgres + PostGIS + pgvector + Auth + Storage + RLS) · Anthropic SDK (Claude com tool use e streaming) · Vercel · branches `feature/* → dev → main`.
- **Mapa:** MapLibre GL JS com tiles OSM/MapTiler (sem lock-in de Mapbox). Desenho e importação de polígono do lote em GeoJSON/KML.
- **PDF:** gerado no servidor (`@react-pdf/renderer` ou Playwright, com justificativa em ADR).
- **Idioma:** interface toda em **pt-BR**, moeda em R$, áreas em m².

## Princípios inegociáveis

1. **O LLM nunca calcula números.** Todo cálculo (potencial construtivo, VGV, custos, margem, TIR, payback) sai de um **motor determinístico em TypeScript puro**, com testes unitários. O LLM só chama o motor via tool e explica o resultado.
2. **O LLM nunca inventa parâmetro urbanístico.** CA, TO, gabarito, recuos e usos vêm **somente** da tabela de regras com `status = 'validado'`. Sem dado: "não temos esse parâmetro validado para essa zona", com sugestão do que fazer.
3. **Rastreabilidade em tudo.** Cada parâmetro e premissa carrega a **fonte** (lei + artigo, tabela CUB + mês/UF, comparável + data, ou "premissa do usuário"). A UI mostra a fonte em tooltip ou rodapé.
4. **Preliminar por definição.** Todo relatório traz: "Estudo preliminar automatizado. Não substitui análise técnica, jurídica e de due diligence por profissional habilitado."
5. **Risco é metodologia, não opinião.** "Risco Baixo/Médio/Alto" vem de score com regras explícitas (Módulo 4), nunca da intuição do LLM.
6. **Multi-tenant desde o dia 1:** cada organização só vê as próprias análises. Land bank com visibilidade controlada. RLS em todas as tabelas.

## Personas e permissões

| Papel          | Quem                                     | Pode                                                                                                   |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `admin`        | Time virtual.estate / Lugh               | Cadastrar municípios, zonas, leis, validar regras extraídas, gerenciar land bank, CUB e comparáveis    |
| `analista`     | Engenheiro parceiro (validação)          | Tudo do `membro` + marcar resultados como "conferido / divergente" com comentário (loop de calibração) |
| `membro`       | Incorporadora, construtora ou investidor | Chat, análises, relatórios, perfil de investidor                                                       |
| `proprietario` | Dono do terreno                          | **Fora do MVP.** Só o enum reservado                                                                   |

## Módulos

### Módulo 1: Land Bank

Cadastro de terrenos (admin):

- **Identificação:** código interno, endereço, bairro, município (FK), UF, CEP, **geometria (polígono PostGIS)** e centroide.
- **Físico:** área (m², calculada do polígono, com opção de sobrescrever), testada(s), topografia (plano / aclive / declive + %), formato, esquina.
- **Jurídico/documental:** nº da matrícula, cartório, upload da matrícula e outros documentos (Storage), ônus conhecidos, situação (`disponível | em negociação | reservado | vendido | indisponível`).
- **Comercial:** preço pedido, forma de negociação (`dinheiro | permuta física | permuta financeira | misto`), % de permuta, proprietário (contato **visível só para admin**).
- **Restrições físico-ambientais:** APP, área alagável, faixa de domínio, tombamento, servidões. MVP: **checklist manual + upload de camadas GeoJSON por município**, com interseção automática via PostGIS quando houver camada.
- Fotos.

### Módulo 2: Base normativa genérica (motor de regras por município)

- `municipalities` (código IBGE, UF, nome, status de cobertura).
- `legal_documents`: lei/decreto, número, data, vigência, PDF no Storage, URL oficial.
- `zones`: zona/macrozona/ZEIS por município, **geometria opcional** (zona do lote por interseção) e fallback manual.
- `zoning_rules`: parâmetros por zona × uso: CA mínimo/básico/máximo, TO máxima, taxa de permeabilidade, gabarito (m e/ou pavimentos), recuos (frontal, lateral, fundos, com fórmula opcional em função da altura), lote mínimo, testada mínima, usos permitidos/proibidos, outorga onerosa (fórmula/fator), observações. **Cada campo** tem `source_document_id`, `artigo`, `trecho_citado`.
  - Recuos dependentes da altura (ex.: `R = H/10 com mínimo de 3m`) ficam como **expressão segura** (mini-DSL ou JSON de fórmula, **nunca `eval`**).
- **Pipeline de ingestão de lei** (admin): upload do PDF → extração de texto (OCR se escaneado) → chunking → embeddings em pgvector (RAG) → **extração assistida por IA** dos parâmetros em JSON (Zod) → regras como `status = 'rascunho'` → revisão lado a lado (trecho ↔ campo) → `validado`.
  - **Só regras validadas** alimentam o motor. O RAG pode citar a lei, sempre com a ressalva de que é texto da norma e não parâmetro conferido.

### Módulo 3: Dados de mercado

- `cub_values`: UF, mês/ano, padrão (R1/R8/R16/CAL/CSL…, baixo/normal/alto), R$/m², fonte (Sinduscon). Entrada manual + CSV. **Sempre o CUB mais recente da UF, mostrando o mês de referência.**
- `market_comparables`: lançamentos/ofertas com localização (ponto), tipologia, área privativa, preço, R$/m², data, fonte. Import CSV.
- `market_indicators` por bairro/região (opcional): VSO, estoque, preço médio.
- **Preço de venda sugerido:** mediana do R$/m² dos comparáveis num raio configurável, mesma tipologia, N amostras e janela de data. Mostrar N e desvio. Abaixo de N mínimo: "baixa confiança".

### Módulo 4: Motor de viabilidade (núcleo; determinístico e testado)

Pacote isolado, **função pura** `calcularViabilidade(input) → output`, tipos completos e testes (Vitest) com casos-limite.

- **A. Potencial construtivo:** área computável = área × CA (básico e máximo, este com outorga); projeção = área × TO, compatível com recuos e geometria (aproximação retangular por área e testada, sinalizada); pavimentos limitados por gabarito; área não computável como premissa editável; área privativa = computável × **eficiência** (editável, ex.: 0,75–0,85).
- **B. Receita:** **VGV** = área privativa × preço de venda (R$/m²), sugerido pelo Módulo 3 e editável. Modelo do MVP: **incorporação para venda** (locação/ABL é modo futuro; usar "Área Privativa").
- **C. Custos:** terreno (preço **ou** permuta, % do VGV/unidades abatida da receita); construção (CUB × área equivalente × fator de ajuste); projetos e aprovações, outorga onerosa, ITBI/registro, marketing/stand, corretagem (% VGV), administração, **impostos (RET 4% default, editável)**, contingência.
- **D. Resultados:** lucro, **margem líquida sobre VGV**, **ROI sobre capital investido**, **TIR** e **payback** a partir de **fluxo de caixa mensal simplificado** (curvas de obra e vendas parametrizáveis; prazos de aprovação, obra e vendas). **Cada métrica definida sem ambiguidade.**
- **E. Cenários:** Conservador / Base / Otimista com deltas configuráveis (preço, custo, velocidade de vendas), em tabela comparativa.
- **F. Score de risco (0–100 → Baixo/Médio/Alto):** soma ponderada de flags explícitas com pesos configuráveis:
  - Urbanístico: regra não validada, zona identificada só manualmente, uso não permitido.
  - Físico: interseção com APP/alagável, topografia acentuada, área/testada abaixo do mínimo.
  - Jurídico: matrícula ausente, ônus registrado.
  - Mercado: comparáveis abaixo do N mínimo, alta dispersão, margem do cenário conservador abaixo do limiar.
  - O output lista **quais flags dispararam** e a UI mostra. Nunca só a palavra "Baixo".
- **G. Melhor uso recomendado:** candidatos a partir dos usos permitidos, motor para cada um, ranking por margem/TIR ajustada a risco. O LLM só **redige** a justificativa.

> **Calibração:** defaults (eficiência, fator CUB, curvas, pesos de risco) em `feasibility_defaults`, editável pelo admin. Cada execução registrada em `analysis_runs` (input, output, versão do motor).

### Módulo 5: Copiloto (chat com IA)

- Claude via Anthropic SDK, **streaming**, **tool use**, modelo por env var.
- **Tools** (schema Zod ↔ JSON Schema, permissão verificada no servidor): `buscar_terrenos`, `obter_terreno`, `identificar_zona`, `consultar_parametros_urbanisticos` (só validados, com fontes), `buscar_legislacao` (RAG com lei e artigo), `consultar_mercado`, `calcular_viabilidade` (persiste `analysis_run`), `comparar_terrenos`, `recomendar_terrenos` (matchmaking), `gerar_relatorio`.
- **Perfil do investidor:** ticket, tipologias, regiões, modelo de aquisição (compra/permuta), margem mínima, tolerância a risco, horizonte. Vira contexto do chat.
- **Entrada fora do land bank:** geocodificar, identificar município e zona, rodar análise com área informada. Sem cobertura: "Município ainda sem base normativa validada" + pedido de cobertura (lead para o admin).
- **Respostas ricas:** cards estruturados (terreno, comparativo, zoneamento ✓/⚠) vindos de JSON das tools, não de texto livre.
- **Painel lateral contextual:** mapa do lote, indicadores de mercado, destaques de zoneamento com fonte.
- Histórico de conversas (renomear, excluir) e anexos via Storage (contexto, não fonte validada).
- System prompt versionado em `lib/ai/prompts/copiloto.v1.md`.

### Módulo 6: Relatório de viabilidade interativo

- Resumo (margem, ROI, TIR, payback, risco com flags, situação do lote), **variáveis editáveis**, **Recalcular** no servidor, 3 cenários, gráfico de fluxo de caixa acumulado / ROI no tempo, mapa, seção urbanística com fontes, premissas com origem.
- **Versionamento:** cada "Salvar" cria versão; rascunho com "Descartar / Salvar alterações".
- **Exportar PDF** com identidade, data, versão do motor, premissas, fontes e disclaimer.
- Link compartilhável (token, somente leitura) preparado.
- Feedback de analista: "conferido / divergente + comentário".

### Módulo 7: Painel admin

CRUD de municípios, documentos legais, zonas (upload GeoJSON), revisão de regras extraídas (diff lado a lado), land bank, CUB, comparáveis (CSV), defaults do motor, pesos de risco, usuários/organizações e fila de pedidos de cobertura.

## Telas de referência

Mockups em `docs/mockups/` são referência de **layout e linguagem visual, não de conteúdo**. Tokens: `primary #0d968b`, `background-light #f6f8f8`, `background-dark #102220`, Inter, ícones lucide-react, dark mode por classe; tema escuro alinhado ao pitch.

1. `chat.html`: Nova análise.
2. `recomendacao.html`: Chat ativo com card de terreno e painel de contexto do lote.
3. `relatorio.html`: Relatório detalhado.

**Correções obrigatórias:** remover conteúdo americano (Austin, Miami, Portland, "123 Oak St", "Alex Henderson"…) e usar dados brasileiros fictícios; "Desenvolvedor Pro" → papel/plano real; nada de inglês na UI; "Landing Bank" → "Land Bank"; terminologia ambiental brasileira (APP, área alagável, zona de proteção ambiental, faixa não edificável); "ABL" → Área Privativa; "ROI anual" e "Margem líquida" como métricas distintas com tooltip; CUB dinâmico; risco sempre com flags; remover "2.4k visitas / 3 propostas", "Meus Ativos", "Tendências de Mercado" e "Motor de Análise v2.4" (usar a versão real do motor).

## Especificação do system prompt do copiloto

`copiloto.v1.md` deve: definir o papel (analista brasileiro que faz triagem, não veredito); obrigar tools para todo dado factual; exigir fonte de cada parâmetro e distinguir _validado_ × _texto da lei via RAG_ × _premissa do usuário_; dizer o que fazer na falta de dado; usar o perfil do investidor; formatar texto curto + blocos estruturados; defender contra prompt injection em anexos e trechos de lei; recusar fora do escopo; trazer 3–5 few-shots (recuo validado, zona sem regra, recomendação por perfil, comparação, município sem cobertura). Evals em `lib/ai/evals/` (~20 casos, script com taxa de acerto, meta ≥ 90%).

## Modelo de dados inicial

`organizations, profiles (role), investor_profiles, municipalities, legal_documents, legal_chunks (embedding), zones (geom), zoning_rules (+ rule_sources), environmental_layers (geom, tipo), lands (geom…), land_documents, land_photos, cub_values, market_comparables (geom), feasibility_defaults, risk_weights, analysis_runs (input, output, engine_version), reports, report_versions, analyst_reviews, conversations, messages (content, tool_calls), attachments, coverage_requests, audit_log`. RLS em todas, GIST nas geometrias, HNSW no embedding, tipos TS gerados.

## Fases de entrega

Uma fase por vez; ao fim: lint, typecheck, testes, resumo e pendências. Branch `feature/<fase>` a partir de `dev`.

- **Fase 0, fundação:** repo, Next.js + TS strict + Tailwind + shadcn, ESLint/Prettier, Vitest, Supabase, `.env.example`, Auth (e-mail + magic link), layout base com sidebar e tema claro/escuro, CI. _Aceite:_ login funcionando, deploy de preview na Vercel.
- **Fase 1, dados:** migrations + RLS + seed fictício (1 município com 3 zonas e regras validadas, 10 terrenos, CUB de 1 UF, 30 comparáveis) + admin de land bank, municípios, zonas e regras. _Aceite:_ admin cadastra terreno com polígono e o sistema identifica a zona por interseção.
- **Fase 2, motor:** Módulo 4 completo, cobertura ≥ 90%, casos-limite (outorga, permuta, lote mínimo, comparáveis insuficientes, recuo por fórmula). _Aceite:_ `docs/validacao/caso-01.md` batendo com cálculo à mão; 2–3 estudos reais anonimizados do Gabriel como gabarito.
- **Fase 3, copiloto:** chat, tools, cards, painel lateral, histórico, perfil, prompt v1 + evals. _Aceite:_ evals ≥ 90%; "qual o recuo frontal do terreno X?" retorna valor + lei/artigo, ou declara a ausência.
- **Fase 4, relatório:** página interativa, recalcular, cenários, gráfico, versões, PDF, feedback de analista. _Aceite:_ recalcular < 1s; PDF com premissas, fontes e disclaimer.
- **Fase 5, ingestão normativa:** upload → texto/OCR → chunks/embeddings → extração assistida → revisão → validação. _Aceite:_ uma lei real ingerida e validada de ponta a ponta.
- **Fase 6, matchmaking e acabamento:** `recomendar_terrenos`, melhor uso, estados vazios/erro/loading, responsividade, WCAG AA, observabilidade (custo de tokens), rate limit nas rotas de IA.

## Fora de escopo do MVP

Marketplace e propostas, portal do proprietário, pagamentos/assinaturas, integração automática com prefeituras/cartórios, modo locação (ABL), app mobile nativo, cobertura normativa automática do Brasil.

## Padrões de código

Server Actions/Route Handlers para mutações; chave da Anthropic só no servidor; Zod em toda fronteira; nada de `eval`/`new Function`; commits pequenos e consistentes; ADRs em `docs/adr/`; justificar cada dependência nova em uma linha.

## Pendências com o cliente

Não bloqueiam; usar o default e marcar `// TODO(cliente):`.

1. Fórmulas e premissas oficiais do Gabriel. _Default: valores de mercado usuais, editáveis._
2. Primeiro município com base normativa ingerida para os testes com engenheiros. _(Seed: Fortaleza/CE.)_
3. Fontes de dados de mercado. _Default: import CSV._
4. Visibilidade do land bank entre organizações. _Default: membros veem terrenos `disponível`; contato do proprietário só admin._
5. Modelo de negócio/planos (só rótulos no MVP).
6. Marca: "virtual.estate" ou "virtual-estate". _Default: virtual.estate._

## Decisões registradas

| Data       | Decisão                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | Repositório próprio: `queirozjuansilva-rgb/virtual-state`.                                                                                          |
| 2026-10-11 | Dev usa projeto Supabase na nuvem (`virtual-estate-dev`, sa-east-1), sem Supabase local.                                                            |
| 2026-10-11 | Contas de serviços em nome da Lugh.                                                                                                                 |
| 2026-10-11 | Cadastro aberto por enquanto; login por e-mail + senha e por magic link.                                                                            |
| 2026-10-11 | Um usuário pertence a uma organização (tabela de vínculo mantida para não travar o futuro).                                                         |
| 2026-10-11 | Município do seed: Fortaleza/CE (geografia real, dados urbanísticos fictícios).                                                                     |
| 2026-10-11 | Lote em mais de uma zona: usa a zona de maior interseção + flag de risco "lote em múltiplas zonas".                                                 |
| 2026-10-12 | Por enquanto, a própria equipe atua como engenheiros/analistas; SMTP próprio deixa de ser urgente.                                                  |
| 2026-10-12 | Conta queirozjuansilva@gmail.com é `admin`. MapTiler: a Lugh vai criar a conta; até lá, OSM só em dev.                                              |
| 2026-10-12 | CUB-CE do seed: valores públicos (Sinduscon-CE, R8-N, set/25–ago/26).                                                                               |
| 2026-10-12 | Métricas do motor: margem = lucro ÷ VGV total; ROI = lucro ÷ exposição máxima de caixa; TIR anualizada do fluxo mensal; payback nominal (ADR 0007). |
| 2026-10-12 | Sem os estudos do Gabriel, o caso-01 é um cálculo independente da Lugh, marcado "a conferir".                                                       |
| 2026-10-12 | Copiloto com `claude-sonnet-5-5` (trocável por `ANTHROPIC_MODEL`); fallback de recusa no servidor ligado por padrão (ADR 0009).                     |
| 2026-10-12 | Localização no chat por clique no mapa até a chave do MapTiler; `recomendar_terrenos` fica para a Fase 6 e `gerar_relatorio` para a Fase 4.         |
| 2026-10-13 | Com a chave da MapTiler, o copiloto também localiza endereços digitados (`localizar_endereco`, prompt `copiloto.v2`).                               |

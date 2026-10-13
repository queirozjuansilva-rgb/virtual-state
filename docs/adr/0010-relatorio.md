# ADR 0010: Relatório de viabilidade (versões, recálculo, PDF e link)

- **Status:** aceita.
- **Data:** 2026-10-13

## Contexto

O PRD (Módulo 6) pede um relatório interativo com variáveis editáveis, **Recalcular no servidor**, 3 cenários, gráfico, mapa, seção urbanística com fontes e premissas com origem. Também pede versões (cada "Salvar" cria uma), PDF, link somente leitura e feedback de analista. O aceite da Fase 4 é recalcular em menos de 1 s e um PDF com premissas, fontes e disclaimer.

## Decisão

### Modelo

- **Versão 1:** o relatório nasce de um estudo registrado (`analysis_runs`). A versão 1 é a entrada e a saída daquele estudo.
- **Criação:** `public.criar_relatorio` (SECURITY INVOKER) cria o relatório e a versão 1 numa transação. É idempotente: se a organização já tem relatório daquele estudo, devolve o existente.
- **Contexto do estudo:** o que a entrada do motor não guarda (referência e ponto, para estudos fora do land bank) fica em `analysis_runs.contexto` e é copiado para `reports.contexto`.
- **Origens:** botão "Abrir relatório" no painel de estudo do admin e no cartão de viabilidade do chat, e a ferramenta `gerar_relatorio` do copiloto (prompt `copiloto.v3`).

### Edição e recálculo

- **Campos editáveis:** a lista fica em `src/lib/relatorio/edicao.ts`, pura. Preço de venda, preço do terreno e forma de aquisição, CUB e fator, eficiência, CA máximo, prazos, impostos e comissões; o resto fica no bloco "Avançado".
- **Fora da edição:** os limiares de risco (declividade, N e dispersão dos comparáveis, margem mínima) são metodologia, não premissa do estudo.
- **Origem e validação:** o valor editado passa a ter a fonte "premissa do usuário (ajustado no relatório)". A validação é a mesma do motor (`premissasSchema`).
- **Recalcular:** uma Server Action recebe só as edições, aplica sobre a entrada da versão e roda o motor puro. O tempo é medido na tela (ida e volta e só o motor).
  - Sem consulta de perfil, porque a RLS já restringe a versão.
  - Medido em dev: 426 a 602 ms de ida e volta, com o motor levando de 0,6 a 3 ms.
- **Salvar:** recalcula no servidor (o cliente nunca manda números), registra a execução em `analysis_runs` e grava a versão com `public.salvar_versao_relatorio`.
  - A função trava a linha do relatório e recusa salvar se alguém gravou outra versão enquanto você editava.
  - O histórico mostra o que mudou entre versões ("de → para"); versões antigas abrem só para leitura (`?versao=N`).

### PDF

- **Biblioteca:** `@react-pdf/renderer`, no servidor, sem navegador headless.
  - Playwright/Chromium foi descartado: pesa centenas de MB e tem partida lenta em funções serverless.
  - O react-pdf é JavaScript puro e roda na Vercel sem configuração extra.
- **Modelo puro:** o conteúdo vem de `montarModeloPdf` (em `src/lib/relatorio/pdf-modelo.ts`, testado). Página e PDF usam as mesmas funções de seção (`src/lib/relatorio/secoes.ts`). O gráfico usa a mesma geometria (`grafico.ts`).
- **Conteúdo:**
  - identidade (virtual.estate + organização), data de geração, versão do relatório e do motor;
  - resumo, situação, cenários, fluxo de caixa, potencial e parâmetros urbanísticos com lei e artigo;
  - risco com as flags, todas as premissas com a origem;
  - disclaimer e "Página X de Y" no rodapé de todas as páginas.
- **Fonte:** Helvetica padrão, que cobre o português (WinAnsi).
- **Armadilhas do react-pdf 4:**
  - `lineHeight` na `Page` faz textos com `render` (número da página) sumirem.
  - `minPresenceAhead` não impede título órfão. Por isso título, cabeçalho e primeira linha de cada tabela ficam num bloco que não quebra.

### Link compartilhável

- **Token:** 32 bytes aleatórios (base64url), gerado no servidor e guardado em `reports.share_token`. "Gerar novo" invalida o anterior; "Desligar" apaga o token.
- **Página pública:** `/r/[token]` e `/r/[token]/pdf`, sem login (o proxy libera `/r`). A leitura é pela função `public.relatorio_compartilhado` (SECURITY DEFINER, `anon`), que devolve só a última versão salva, sem dados do proprietário. O 404 é em português.

### Revisão de analista

- **Quem revisa:** "Conferido" ou "Divergente + comentário" (o comentário é obrigatório na divergência) por versão. Só analista e admin, como já estava no RLS.
- **Exibição:** a lista mostra o nome de quem revisou por `public.revisoes_do_relatorio`, porque membros não leem perfis alheios.

## Consequências

- **Gráfico:** só o cenário base. Mostrar conservador e otimista exigiria o motor devolver o fluxo mensal de cada cenário (mudança de formato, versão 0.2.0).
- **Edição:** a página edita premissas, não dados do terreno (área, testada) nem a regra urbanística. Para isso, o caminho é o cadastro ou a validação da regra no admin.
- **Recálculo:** o rascunho não é gravado. Só "Salvar alterações" registra a execução e cria a versão, o que evita encher `analysis_runs` de rascunhos.
- **Avisos do linter do Supabase (0028/0029):** apontam `relatorio_compartilhado` e `revisoes_do_relatorio` como SECURITY DEFINER executáveis por `anon`/`authenticated`. É intencional.
  - A primeira só responde a um token aleatório de 32 bytes, e só com a última versão daquele relatório.
  - A segunda confere dentro dela se quem chama vê o relatório (organização ou admin).

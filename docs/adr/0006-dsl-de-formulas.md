# ADR 0006: DSL de fórmulas urbanísticas

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto

Recuos e outorga podem depender de outras grandezas (ex.: `R = H/10, com mínimo de 3 m`). O PRD proíbe `eval`/`new Function` e pede uma expressão segura.

## Decisão

- **Mini-linguagem própria** em `src/lib/formula` (TypeScript puro, sem dependências), com tokenizador e parser de descida recursiva:
  - números com ponto decimal (`2.5`); `+ - * /`, menos unário e parênteses;
  - **variáveis em lista branca:** `H` (altura, m), `P` (pavimentos), `A` (área do terreno, m²), `T` (testada, m);
  - **funções em lista branca:** `min`, `max` (2+ argumentos), `floor`, `ceil`, `round`.
- Limites: 200 caracteres e profundidade 32. Erros com mensagem em pt-BR e posição ("Falta fechar o parêntese de max(…)", "Use ponto como separador decimal").
- **Armazenamento:** o banco guarda o texto **canônico** (`formatFormula`, ex.: `max(H / 10, 3)`), validado no servidor antes de gravar. O motor reinterpreta o texto com o mesmo parser; não há AST duplicado no banco.
- `formulaVariables()` diz de que a fórmula depende (ex.: o recuo lateral precisa de `H`, que o motor calcula a partir do gabarito/pavimentos).
- O formulário mostra a forma canônica e um exemplo calculado enquanto o admin digita.

## Alternativas descartadas

- `expr-eval`/`mathjs`: superfície maior que a necessária e, no caso do `expr-eval`, sem manutenção ativa.
- AST em JSON digitado à mão: seguro, mas inviável para o admin.

## Consequências

- 54 testes cobrem precedência, erros, limites e tentativas de injeção (`constructor`, `process.exit()`, `require(...)` etc.).
- Novas variáveis ou funções exigem mudar a lista branca e os testes, de propósito.

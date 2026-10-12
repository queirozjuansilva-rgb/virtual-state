# ADR 0008: Score de risco

- **Status:** aceita. Pesos e limiares aguardam calibração (`TODO(cliente)`).
- **Data:** 2026-10-12

## Contexto

Princípio 5 do PRD: o risco "Baixo/Médio/Alto" vem de metodologia explícita, nunca da intuição do LLM, e a UI mostra sempre as flags que o compõem.

## Decisão

- **Score:** soma dos pesos das flags disparadas, limitada a 100.
  - **Baixo:** abaixo de 25.
  - **Médio:** de 25 a 49.
  - **Alto:** 50 ou mais.
  - Os limiares ficam em `feasibility_defaults` (`risco.limiar_medio` e `risco.limiar_alto`).
- **Pesos:** ficam em `risk_weights`, editáveis pelo admin. Uma flag inativa vale 0. Cada flag disparada sai com eixo, rótulo, peso e um **detalhe** com os números que a causaram.

| Eixo        | Flag                         | Peso | Dispara quando                                                                 |
| ----------- | ---------------------------- | ---: | ------------------------------------------------------------------------------ |
| Urbanístico | `regra_nao_validada`         |   30 | não há regra validada para o uso na zona                                       |
|             | `uso_nao_permitido`          |   40 | a regra validada proíbe o uso                                                  |
|             | `parametro_ausente`          |   15 | falta CA básico, TO, gabarito, algum recuo ou (com outorga) o fator de outorga |
|             | `zona_nao_identificada`      |   25 | nenhuma zona cruza o lote                                                      |
|             | `zona_atribuida_manualmente` |   10 | zona escolhida à mão                                                           |
|             | `lote_multiplas_zonas`       |   10 | o lote cruza mais de uma zona                                                  |
| Físico      | `restricao_app`              |   25 | interseção com APP (camada ou checklist)                                       |
|             | `restricao_alagavel`         |   25 | área alagável                                                                  |
|             | `restricao_ambiental_outra`  |   15 | proteção ambiental, faixa não edificável/de domínio, tombamento ou servidão    |
|             | `topografia_acentuada`       |   10 | declividade ≥ limiar (15%)                                                     |
|             | `area_abaixo_minimo`         |   20 | área < lote mínimo da zona                                                     |
|             | `testada_abaixo_minimo`      |   15 | testada < testada mínima                                                       |
|             | `testada_estimada`           |    5 | testada não informada                                                          |
| Jurídico    | `matricula_ausente`          |   20 | sem nº de matrícula                                                            |
|             | `onus_registrado`            |   15 | ônus informado no cadastro                                                     |
| Mercado     | `comparaveis_insuficientes`  |   15 | N < mínimo (5) ou nenhum comparável                                            |
|             | `dispersao_preco_alta`       |   10 | coeficiente de variação > 20%                                                  |
|             | `margem_conservadora_baixa`  |   20 | margem do cenário conservador < 12%                                            |

## Consequências

- O score é auditável e reproduzível: mesma entrada, mesmas flags.
- Os pesos são uma primeira proposta. A calibração vem do loop com os analistas: o veredito "conferido/divergente" nos relatórios (Fase 4) comparado às execuções registradas em `analysis_runs`.

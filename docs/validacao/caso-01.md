# Caso de conferência 01: ZT-2, residencial vertical, 2.000 m²

> **Status:** calculado pela Lugh, **aguardando conferência do Gabriel**. Este caso confere que o motor implementa corretamente as fórmulas descritas na ADR 0007. Ele **não** valida se as fórmulas e premissas estão certas para o mercado. Essa calibração depende dos 2–3 estudos reais anonimizados do Gabriel (caso-02 em diante).

- **Motor:** v0.1.0
- **Conferência automática:** `src/lib/feasibility/caso-01.test.ts` (o teste quebra se o motor divergir destes números)
- **Cálculo independente:** `docs/validacao/caso-01.py`, escrito a partir das regras abaixo, sem usar o código TypeScript. Para reproduzir: `python3 docs/validacao/caso-01.py`

## Entradas

Lote inspirado no VE-0004 do seed, com números redondos para facilitar a conta à mão.

| Item                               | Valor                                          | Fonte                             |
| ---------------------------------- | ---------------------------------------------- | --------------------------------- |
| Área do terreno (A)                | 2.000 m²                                       | Cadastro                          |
| Testada (T) / profundidade (A ÷ T) | 40 m / 50 m                                    | Cadastro / aproximação retangular |
| Zona e uso                         | ZT-2, residencial vertical                     | Lei fictícia 999/2026-TESTE       |
| CA básico / máximo                 | 1,5 / 2,5                                      | idem                              |
| Taxa de ocupação                   | 60%                                            | idem                              |
| Gabarito                           | 48 m e 16 pavimentos                           | idem                              |
| Recuos                             | frontal 5 m; lateral e fundos `max(H/12; 2,5)` | idem                              |
| Lote mínimo / testada mínima       | 360 m² / 12 m                                  | idem                              |
| Preço do terreno                   | R$ 5.500.000 (compra)                          | Cadastro                          |
| CUB R8-N/CE                        | R$ 2.458,13/m² (ago/2026)                      | Sinduscon-CE                      |
| Preço de venda                     | R$ 11.000/m² privativo                         | Comparáveis (10 amostras)         |
| Demais premissas                   | defaults da plataforma (ADR 0007)              | `feasibility_defaults`            |

Premissas padrão usadas: eficiência 80%; área não computável 40% da computável, com equivalência de custo de 0,5; pé-direito 3 m; fator sobre o CUB 1,30; ITBI 3% + registro 1%; projetos 4% da obra; marketing 3% e corretagem 5% da receita; administração 3% e contingência 5% da obra; RET 4% da receita; aprovação 6, obra 30 e vendas 24 meses; 30% vendido no lançamento; recebimento 10% sinal, 20% em mensais durante a obra e 70% nas chaves; curva de obra em S.

## Etapa A: potencial construtivo

- Área computável alvo (CA básico): 2.000 × 1,5 = **3.000 m²**
- Projeção máxima pela TO: 2.000 × 0,60 = **1.200 m²**
- Pavimentos máximos: mín(16; ⌊48 ÷ 3⌋ = 16) = 16

Para cada número de pavimentos n, a altura é H = 3n e o recuo lateral/fundos é máx(H/12; 2,5):

|   n | H (m) | Lateral/fundos (m) |          Retângulo após recuos (m²) | Projeção = mín(TO, recuos) | Capacidade = projeção × n |
| --: | ----: | -----------------: | ----------------------------------: | -------------------------: | ------------------------: |
|   1 |     3 |                2,5 | (40 − 5) × (50 − 5 − 2,5) = 1.487,5 |                      1.200 |                     1.200 |
|   2 |     6 |                2,5 |                             1.487,5 |                      1.200 |                     2.400 |
|   3 |     9 |                2,5 |                             1.487,5 |                      1.200 |         **3.600 ≥ 3.000** |

O motor escolhe o menor n que atinge o alvo: **3 pavimentos, 9 m**.

- **Limitante:** o coeficiente de aproveitamento. A projeção do pavimento-tipo é limitada pela TO.
- **Área computável:** 3.000 m².
- **Área não computável:** 3.000 × 0,4 = 1.200 m².
- **Área construída total:** 4.200 m².
- **Área equivalente para custo:** 3.000 + 1.200 × 0,5 = **3.600 m²**.
- **Área privativa:** 3.000 × 0,8 = **2.400 m²**.
- **Área adicional sujeita a outorga:** 0 (usa só o CA básico).

## Etapas B e C: receita e custos

**VGV** = 2.400 × 11.000 = **R$ 26.400.000** (compra à vista, sem permuta: a receita do incorporador é igual ao VGV).

| Custo                 | Cálculo                 |        Valor (R$) |
| --------------------- | ----------------------- | ----------------: |
| Terreno               | preço pedido            |      5.500.000,00 |
| ITBI + registro       | 5.500.000 × 4%          |        220.000,00 |
| Construção            | 3.600 × 2.458,13 × 1,30 |     11.504.048,40 |
| Projetos e aprovações | 4% da construção        |        460.161,94 |
| Outorga onerosa       | sem área adicional      |              0,00 |
| Marketing             | 3% da receita           |        792.000,00 |
| Corretagem            | 5% da receita           |      1.320.000,00 |
| Administração         | 3% da construção        |        345.121,45 |
| Contingência          | 5% da construção        |        575.202,42 |
| Impostos (RET)        | 4% da receita           |      1.056.000,00 |
| **Total**             |                         | **21.772.534,21** |

## Etapa D: fluxo de caixa e métricas

**Linha do tempo**

- **Mês 0:** compra do terreno.
- **Meses 1–6:** aprovação. Os projetos são distribuídos em parcelas iguais nesse período.
- **Mês 7:** lançamento e início da obra. A obra vai até o mês 36, com desembolso em curva S: peso de cada mês proporcional a sen(π(i + 0,5)/30).
- **Meses 7–30:** vendas. 30% + 70%/24 no mês 7 e 70%/24 nos demais.
- **Mês 37:** chaves.

**Recebimentos de cada coorte de vendas**

- 10% no mês da venda.
- 20% divididos igualmente pelos meses de obra restantes.
- 70% nas chaves.

Marketing e corretagem seguem a curva de vendas. O RET é pago sobre o que é recebido em cada mês.

| Métrica          | Definição                                |                Valor |
| ---------------- | ---------------------------------------- | -------------------: |
| Lucro            | soma do fluxo = receita − custos         |  **R$ 4.627.465,79** |
| Margem líquida   | lucro ÷ VGV                              |           **17,53%** |
| Exposição máxima | módulo do menor acumulado (mês 31)       | **R$ 13.783.852,88** |
| ROI              | lucro ÷ exposição máxima                 |           **33,57%** |
| TIR mensal       | taxa que zera o VPL do fluxo mensal      |     **1,1039% a.m.** |
| TIR anual        | (1 + TIR mensal)¹² − 1                   |      **14,08% a.a.** |
| Payback          | mês em que o acumulado volta a ficar ≥ 0 |         **37 meses** |

<details>
<summary>Fluxo mensal completo</summary>

| Mês | Entradas (R$) |  Saídas (R$) |    Saldo (R$) | Acumulado (R$) |
| --: | ------------: | -----------: | ------------: | -------------: |
|   0 |          0,00 | 5.720.000,00 | -5.720.000,00 |  -5.720.000,00 |
|   1 |          0,00 |    76.693,66 |    -76.693,66 |  -5.796.693,66 |
|   2 |          0,00 |    76.693,66 |    -76.693,66 |  -5.873.387,31 |
|   3 |          0,00 |    76.693,66 |    -76.693,66 |  -5.950.080,97 |
|   4 |          0,00 |    76.693,66 |    -76.693,66 |  -6.026.774,62 |
|   5 |          0,00 |    76.693,66 |    -76.693,66 |  -6.103.468,28 |
|   6 |          0,00 |    76.693,66 |    -76.693,66 |  -6.180.161,94 |
|   7 |    869.000,00 |   763.991,01 |    105.008,99 |  -6.075.152,94 |
|   8 |    136.931,03 |   168.797,41 |    -31.866,37 |  -6.107.019,31 |
|   9 |    142.431,03 |   235.592,10 |    -93.161,07 |  -6.200.180,38 |
|  10 |    148.134,74 |   300.551,07 |   -152.416,33 |  -6.352.596,71 |
|  11 |    154.057,82 |   362.965,73 |   -208.907,92 |  -6.561.504,63 |
|  12 |    160.217,82 |   422.155,56 |   -261.937,75 |  -6.823.442,38 |
|  13 |    166.634,48 |   477.475,55 |   -310.841,07 |  -7.134.283,45 |
|  14 |    173.330,13 |   528.323,31 |   -354.993,18 |  -7.489.276,63 |
|  15 |    180.330,13 |   574.145,69 |   -393.815,55 |  -7.883.092,18 |
|  16 |    187.663,47 |   614.444,87 |   -426.781,40 |  -8.309.873,58 |
|  17 |    195.363,47 |   648.783,87 |   -453.420,40 |  -8.763.293,98 |
|  18 |    203.468,73 |   676.791,40 |   -473.322,67 |  -9.236.616,65 |
|  19 |    212.024,29 |   698.165,94 |   -486.141,65 |  -9.722.758,30 |
|  20 |    221.083,11 |   712.679,18 |   -491.596,07 | -10.214.354,36 |
|  21 |    230.708,11 |   720.178,59 |   -489.470,49 | -10.703.824,85 |
|  22 |    240.974,78 |   720.589,26 |   -479.614,49 | -11.183.439,33 |
|  23 |    251.974,78 |   713.914,84 |   -461.940,07 | -11.645.379,40 |
|  24 |    263.820,93 |   700.237,80 |   -436.416,87 | -12.081.796,27 |
|  25 |    276.654,26 |   679.718,82 |   -403.064,55 | -12.484.860,83 |
|  26 |    290.654,26 |   652.595,50 |   -361.941,24 | -12.846.802,07 |
|  27 |    306.054,26 |   619.180,50 |   -313.126,23 | -13.159.928,30 |
|  28 |    323.165,37 |   579.859,10 |   -256.693,72 | -13.416.622,02 |
|  29 |    342.415,37 |   535.086,72 |   -192.671,35 | -13.609.293,37 |
|  30 |    364.415,37 |   485.386,79 |   -120.971,41 | -13.730.264,79 |
|  31 |    313.082,04 |   366.670,13 |    -53.588,09 | -13.783.852,88 |
|  32 |    313.082,04 |   307.726,70 |      5.355,34 | -13.778.497,54 |
|  33 |    313.082,04 |   245.548,96 |     67.533,08 | -13.710.964,46 |
|  34 |    313.082,04 |   180.818,14 |    132.263,90 | -13.578.700,56 |
|  35 |    313.082,04 |   114.243,45 |    198.838,59 | -13.379.861,96 |
|  36 |    313.082,04 |    46.554,29 |    266.527,75 | -13.113.334,21 |
|  37 | 18.480.000,00 |   739.200,00 | 17.740.800,00 |   4.627.465,79 |

</details>

## Etapa E: cenários

**Conservador:** preço −10%, custo +10%, vendas 50% mais lentas (36 meses). **Otimista:** preço +5%, custo −5%, vendas 25% mais rápidas (18 meses).

| Indicador        |      Conservador |             Base |         Otimista |
| ---------------- | ---------------: | ---------------: | ---------------: |
| VGV              | R$ 23.760.000,00 | R$ 26.400.000,00 | R$ 27.720.000,00 |
| Custo total      | R$ 22.744.187,63 | R$ 21.772.534,21 | R$ 21.286.707,50 |
| Lucro            |  R$ 1.015.812,37 |  R$ 4.627.465,79 |  R$ 6.433.292,50 |
| Margem líquida   |            4,28% |           17,53% |           23,21% |
| Exposição máxima | R$ 16.277.973,44 | R$ 13.783.852,88 | R$ 12.684.260,49 |
| TIR anual        |            3,00% |           14,08% |           19,80% |
| Payback          |         40 meses |         37 meses |         37 meses |
| Prazo total      |         42 meses |         37 meses |         37 meses |

## Etapa F: risco

Só uma flag dispara: **margem baixa no cenário conservador**, com 4,28% contra o mínimo de 12% (+20). O score fica em **20 de 100**, risco **baixo**.

Não dispararam:

- **Zona e regra:** zona automática, sem múltiplas zonas, regra validada e completa.
- **Lote:** acima do lote mínimo e da testada mínima, matrícula informada e sem ônus.
- **Mercado:** 10 comparáveis com CV de 8%.

## O que pedir ao Gabriel

1. **Fórmulas:** conferir a forma das fórmulas (ADR 0007), não só os números. Em especial:
   - a área equivalente para custo;
   - a base do ITBI na permuta;
   - a curva de recebimento (sinal, mensais e chaves);
   - o pagamento do RET pelo caixa.
2. **Defaults** da tabela acima, que estão marcados como `TODO(cliente)`.
3. **2–3 estudos reais anonimizados**, com as entradas e os resultados que ele obteve. Cada um vira um caso-0N com teste automático.

# ADR 0007: Motor de viabilidade (fórmulas, fluxo e métricas)

- **Status:** aceita (v0.1.0). As fórmulas e os defaults aguardam calibração com o Gabriel (`TODO(cliente)`).
- **Data:** 2026-10-12

## Contexto

O PRD (Módulo 4) pede um motor determinístico, testado, que o LLM só chama e explica. O mockup mostra "ROI anual" e "Margem líquida" com o mesmo número; aqui cada métrica tem definição única.

## Decisão

**Função pura** `calcularViabilidade(entrada) → resultado` em `src/lib/feasibility`, sem banco, rede, relógio ou aleatoriedade (o lint bloqueia). A versão (`ENGINE_VERSION`, semver) vai em cada `analysis_run`. Frações em 0–1, áreas em m², valores em R$, prazos em meses.

### A. Potencial construtivo

- **Aproximação retangular:** lote = testada × (área ÷ testada). Sem testada, o lote vira um quadrado (flag de risco). Lote de esquina: um recuo lateral vira frontal.
- **Áreas:** área computável alvo = área × CA (o básico; o máximo só se `usarCaMaximo`, com outorga). Projeção = mín(TO × área, retângulo após os recuos).
- **Pavimentos:**
  - Os recuos podem depender da altura (`H = n × pé-direito`), via DSL da ADR 0006.
  - O motor itera n de 1 até o gabarito e escolhe o menor n cuja capacidade (projeção × n) atinge o alvo. Se nenhum atinge, escolhe o n de maior capacidade.
  - O motor informa o **limitante** (CA, recuos ou gabarito) e o que limitou a projeção (TO ou recuos).
- **Não computável** = computável × %. **Área equivalente** (base de custo) = computável + não computável × equivalência. **Privativa** = computável × eficiência.
- **Parâmetro ausente:** nunca é inventado. TO, gabarito ou recuo sem validação viram aviso e flag; a regra é aplicada sem aquele limite, e com teto técnico de 40 pavimentos se não houver gabarito.

### B. Receita

- **VGV** = privativa × preço de venda (mediana dos comparáveis ou valor informado, com a fonte).
- **Permuta física:** a receita do incorporador é VGV × (1 − %).
- **Permuta financeira:** o % de cada recebimento é repassado ao proprietário (é custo).
- **Misto:** dinheiro + permuta física.

### C. Custos

- **Terreno** (dinheiro) e **ITBI + registro** sobre o valor de aquisição, isto é, dinheiro + valor da permuta.
- **Construção** = área equivalente × CUB × fator.
- **Percentuais sobre a construção:** projetos, administração e contingência.
- **Percentuais sobre a receita do incorporador:** marketing, corretagem e RET.
- **Outorga** = área adicional × (valor de aquisição ÷ área) × fator da lei. Sem fator validado, o custo não é calculado (aviso e flag).

### D. Fluxo de caixa mensal e métricas

- **Linha do tempo:**
  - **Mês 0:** terreno, ITBI e registro.
  - **Meses 1…A:** aprovação, com os projetos em parcelas iguais; a outorga é paga no mês A.
  - **Meses A+1…A+O:** obra, em curva linear ou S (peso ∝ sen(π(i + 0,5)/O)).
  - **Meses A+1…A+V:** vendas, com uma parte no lançamento e o resto linear.
  - **Mês A+O+1:** chaves.
- **Cada coorte de vendas paga:**
  - o sinal no mês da venda;
  - as mensais nos meses de obra restantes;
  - o saldo nas chaves;
  - tudo no mês da venda, se vendida depois das chaves.
- **Saídas variáveis:** marketing e corretagem seguem a curva de vendas; RET e permuta financeira seguem os recebimentos.
- **Métricas:**
  - **Lucro** = soma do fluxo (igual a receita − custos).
  - **Margem líquida** = lucro ÷ VGV total (inclui as unidades da permuta física). Também sai a margem sobre a receita do incorporador.
  - **Exposição máxima** = módulo do menor saldo acumulado.
  - **ROI** = lucro ÷ exposição máxima, o retorno sobre o capital que de fato precisa ser aportado.
  - **TIR:**
    - É a raiz do VPL mensal, achada por varredura de −90% a +100% a.m. e bisseção.
    - É null sem troca de sinal.
    - A anual é (1 + TIR mensal)¹² − 1.
  - **Payback:** mês a partir do qual o acumulado fica ≥ 0 até o fim; null se termina negativo. É nominal, sem desconto.

### E. Cenários

O motor roda três vezes: base, conservador e otimista, com variações de preço, custo de construção e prazo de vendas (`Math.round`). Os defaults são −10%/+10%/+50% e +5%/−5%/−25%, configuráveis em `feasibility_defaults`.

### G. Melhor uso

O motor roda para cada uso com regra validada. O índice é a TIR anual base × (1 − score de risco ÷ 100); o empate é decidido pela margem. Saem do ranking, com motivo: uso proibido, estudo incompleto, lucro ≤ 0 ou TIR indeterminada. O LLM só redige a justificativa.

### Rastreabilidade

Cada premissa sai com uma `Fonte`: lei e artigo, CUB com padrão/UF/mês, comparáveis com N/raio/data, dado do terreno, premissa do usuário ou default calibrado (com a origem registrada na tabela). Todo resultado leva o disclaimer do PRD.

### Defaults

Ficam em `src/lib/feasibility/defaults.ts` e na tabela `feasibility_defaults` (editável pelo admin). Um teste garante que os dois estão iguais.

## Consequências

- `docs/validacao/caso-01.md` confere o motor contra um cálculo independente em Python, que bate em todas as casas.
- Toda mudança de fórmula ou default que altere números exige subir `ENGINE_VERSION` e refazer os casos de conferência.
- **Simplificações conhecidas, a discutir com o Gabriel:**
  - projeção retangular;
  - uso misto estimado como residencial;
  - CUB de outro padrão como aproximação quando o do uso não está cadastrado (com aviso);
  - fluxo nominal, sem correção pelo INCC, sem financiamento à produção e sem VPL a uma TMA.

# ADR 0005: Rastreabilidade de fontes

- **Status:** aceita (parcial: parâmetros urbanísticos e CUB; premissas do motor na Fase 2)
- **Data:** 2026-10-12

## Contexto

Princípio 3 do PRD: cada parâmetro e premissa carrega a fonte (lei + artigo, CUB + mês/UF, comparável + data ou premissa do usuário), e a UI mostra essa fonte.

## Decisão

- **Parâmetro urbanístico:** fonte **por campo** em `rule_sources (zoning_rule_id, field, legal_document_id, article, excerpt)`, uma linha por campo preenchido. O conjunto de campos é a lista única `RULE_FIELDS` (`src/lib/domain/zoning-rule-fields.ts`), igual no banco (check constraint), no formulário e na validação.
- **Validar exige fonte:** ao clicar em "Salvar e validar", todo campo preenchido precisa de lei e artigo; senão a regra fica em rascunho. Uma nova validação arquiva a anterior (histórico preservado).
- **CUB:** `cub_values` guarda UF, mês de referência, padrão (NBR 12721), valor, fonte, URL e notas. `latest_cub(uf, padrão)` devolve o mais recente; a UI nunca fixa o mês.
- **Comparáveis:** fonte, URL e data de observação por linha.
- **Dados de teste:** `is_fictitious` em leis, camadas, terrenos e comparáveis do seed. Selo "Fictício" na UI. Esses dados nunca podem ir para relatório real (a checagem entra na Fase 4).
- **Fase 2:** o motor vai devolver, junto com cada número, a origem da premissa num tipo `Fonte` (união discriminada: `lei | cub | comparaveis | premissa_usuario | default_calibrado`).

## Consequências

- O copiloto (Fase 3) pode citar lei e artigo de cada parâmetro direto do banco, sem depender do LLM.
- O CUB-CE do seed foi coletado de fonte secundária que cita o Sinduscon-CE (os sites oficiais não responderam); a nota em cada linha pede conferência no boletim oficial.

# Ingestão da LC 62/2009 (Plano Diretor de Fortaleza)

Primeira lei real ingerida pelo pipeline da Fase 5 (ADR 0011). Data: 14/10/2026.

## Documento

| Item                   | Valor                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Norma                  | Lei Complementar nº 62/2009, Plano Diretor Participativo de Fortaleza                                                   |
| Vigência               | Vigente. A LC 450/2025, novo Plano Diretor, só se aplica a partir de 2027                                               |
| Fonte                  | SAPL da Câmara Municipal de Fortaleza (CC BY-SA 4.0), importado pela URL oficial                                        |
| Arquivo                | 437 páginas, 23 MB, todas escaneadas; SHA-256 começa com `6ed80a14f2eb`                                                 |
| Páginas da norma       | 2–30 (publicação no Diário Oficial). As demais são o processo legislativo: projeto, emendas e votações                  |
| Alterações registradas | 22 leis alteradoras, vindas da API do SAPL, ligadas como "altera". A LC 236/2017 (LPUOS) está ligada como "regulamenta" |

O PDF do SAPL traz versões do projeto com valores diferentes dos publicados. Por isso, só as páginas da norma viram trechos de busca.

## Texto e busca

| Etapa                               | Resultado                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| OCR (`claude-sonnet-5-5`, `ocr.v1`) | 437 de 437 páginas. Custo estimado de ~US$ 7, ou US$ 0,013 a 0,021 por página                                               |
| Trechos                             | 200, um por artigo, com seção e página                                                                                      |
| Busca por palavras                  | "índice de aproveitamento zona de ocupação preferencial 1" traz `LC 62/2009, Art. 80 a Art. 81, p. 12` entre os 5 primeiros |

A estimativa inicial de OCR era de US$ 5,60, com 1.700 tokens de saída por página. Páginas densas do Diário Oficial passam disso, e a estimativa da tela foi recalibrada.

**Achado na busca:** a lei de Fortaleza escreve "índice de aproveitamento", e quem pergunta costuma escrever "coeficiente".

- **Antes:** a busca por palavras exigia todos os termos no mesmo trecho, e essa pergunta não trazia nada.
- **Agora:** uma segunda lista aceita qualquer termo, com nota dividida pelo tamanho do trecho, e entra no RRF. A mesma pergunta traz o Art. 78 (seção da ZOP) entre os 5 primeiros.
- **O que falta:** os anexos da LPUOS ainda aparecem antes dos artigos. A busca por sentido (Voyage) resolve isso quando a chave estiver configurada.

## Extração assistida

- **Execução:** `claude-opus-5-5`, prompt `extracao.v1`, páginas 11 a 16, uso-alvo residencial vertical.
- **Tamanho e custo:** 25,5 mil tokens de entrada e 15,8 mil de saída, em 110 s, por **US$ 0,42**.
- **Resultado:** 16 rascunhos (ZOP 1–2, ZOC, ZRU 1–2, ZOM 1–2, ZOM 2 SZ-1, ZOR e ZO T-I a T-VII).
- **Trechos citados:** 121 de 121 localizados automaticamente no texto da página.

### Comparação com o mapa oficial

O mapa de zoneamento do Fortaleza em Mapas (mapa 604, Ipplan/SEUMA) traz CA, TO, altura e permeabilidade por zona. Ele é fonte secundária e é a única referência pública com que dá para comparar a extração. Foram comparados 5 parâmetros nas 16 zonas, 80 valores no total: CA básico, CA máximo, TO, altura e permeabilidade.

| Resultado         | Valores     | Zonas                                 |
| ----------------- | ----------- | ------------------------------------- |
| Igual ao mapa     | 75 (93,75%) | 14 zonas sem nenhuma diferença        |
| Diferente do mapa | 3           | ZO T-V: CA básico, CA máximo e altura |
| Não extraído      | 2           | ZOM 2 SZ-1: TO e permeabilidade       |

**ZO T-V:** a extração está fiel ao texto de 2009. O Art. 118 publicado traz CA 3,0 e altura de 72 m; o mapa traz CA 1,0 e 15 m. Uma das leis alteradoras provavelmente mudou o trecho. A homologação precisa conferir as alterações, e a página da regra mostra o aviso.

**ZOM 2 SZ-1:** a própria IA apontou que a associação da subzona é incerta. Ela não completou os valores de memória, como o prompt manda.

**Fidelidade ao texto-fonte:** 78 de 80 valores (97,5%), com 2 omissões e nenhum valor inventado.

## Pendente para o aceite

- [ ] **Homologação humana de pelo menos uma regra.** Recomendada: ZOP 1, residencial vertical.
  - Quem homologa confere lado a lado com o PDF, verifica as alterações posteriores e registra a nota de homologação.
  - O "uso permitido" depende da LPUOS (LC 236/2017, Anexo 6, e adequação ao sistema viário, Anexo 8). A extração da LC 62 não decide isso.
- [ ] **Copiloto respondendo com a regra validada,** citando a LC 62/2009 e a página.
- [ ] **Busca por sentido:** depende da `VOYAGE_API_KEY`. Até lá, a busca é só por palavras.

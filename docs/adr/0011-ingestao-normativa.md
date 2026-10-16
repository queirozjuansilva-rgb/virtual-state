# ADR 0011: Ingestão normativa, cartografia oficial e fim dos dados fictícios

- **Status:** aceita.
- **Data:** 2026-10-14

## Contexto

O PRD (Módulo 2, Fase 5) pede o pipeline da lei: upload → texto/OCR → trechos e embeddings → extração assistida → revisão → validação. O aceite é uma lei real ingerida e validada de ponta a ponta.

O Master Blueprint Técnico v2.2 (13/10/2026, em `docs/referencias/`) acrescentou exigências:

- evidência completa (página, impressão digital, data de coleta, vigência);
- conflito entre fontes com resolução documentada;
- condição ou exceção por parâmetro;
- busca só em normas vigentes;
- quarentena da extração (nada ativa sozinho).

Com o Gabriel ausente, a equipe decidiu usar dados públicos ao máximo e tirar de cena os fictícios do seed.

## Decisão

### Entrada do documento

- **Importar da fonte oficial:** o admin cola a URL do PDF (SAPL da Câmara, Diário Oficial) e o servidor baixa o arquivo. A URL vira o link oficial do documento.
- **Envio do computador:** alternativa ao download, direto ao Storage por URL assinada, sem passar pelo limite de corpo das Server Actions.
- **Defesas contra SSRF no download** (`src/server/legislacao/download.ts`):
  - só HTTPS na porta padrão;
  - todo IP do host precisa ser público (`src/lib/net/ip.ts`), conferido a cada redirecionamento;
  - até 3 redirecionamentos, 50 MB (PDF) ou 40 MB (GeoJSON), 60 s.
  - Resta o risco de _DNS rebinding_ entre a checagem e a conexão, aceitável para uma ação só de admin.
- **Registro do arquivo:** tamanho, páginas e SHA-256 do arquivo, data de coleta (diferente da vigência) e direito de uso (ex.: CC BY-SA 4.0 do SAPL).
- **Arquivo novo:** apaga páginas e trechos anteriores.

### Texto e OCR

- **Leitura:** a camada de texto vem do `unpdf` (pdf.js sem binários nativos, roda na Vercel). Página com menos de 200 caracteres úteis fica "pendente" de OCR.
- **OCR com o Claude:** o modelo é `claude-sonnet-5-5`, trocável por `INGESTAO_OCR_MODEL`, sem raciocínio estendido e com esforço baixo. O prompt é `ocr.v1`.
  - Vão 4 páginas por chamada, como um recorte de PDF (`pdf-lib`), e 8 chamadas em paralelo por rodada.
  - O modelo marca cada página (`=== PÁGINA N ===`); página que não voltou continua pendente.
- **Armadilha do recorte:** PDFs escaneados costumam compartilhar um dicionário com todas as imagens do documento. Recortar 5 páginas da LC 62/2009 copiava as 437 imagens (23 MB). O recorte poda os recursos e deixa só as imagens que a página desenha (~65 KB por página).
- **Cache:** o PDF fica em cache por documento e impressão digital enquanto a instância estiver quente. Baixar 24 MB a cada rodada dominava o tempo.

### Trechos e busca

- **Divisão** (`src/lib/legislacao/fragmentar.ts`, pura e testada):
  - um trecho por artigo, com seção (Título/Capítulo/Seção) e páginas;
  - artigos curtos e vizinhos da mesma seção são agrupados; longos são partidos em parágrafos ou incisos (~2.400 caracteres);
  - anexos são partidos por tamanho, com o rótulo do anexo;
  - no texto corrido do Diário Oficial, o artigo começa no meio da linha depois de fim de frase, e a divisão quebra ali.
- **Embeddings:** Voyage `voyage-4`, 1024 dimensões, por `fetch` (sem SDK), com `document` para trechos e `query` para a pergunta. O modelo fica salvo por trecho, porque trocar de série exige reindexar.
- **Busca:** `buscar_texto_legal` é híbrida, juntando palavras e sentido por RRF.
  - Só entram normas vigentes (`effective_from`/`effective_until`), não revogadas por inteiro e não arquivadas.
  - "Hoje" é a data em America/Fortaleza (`private.data_operacional()`), não a do fuso do banco (UTC). A revogação integral vale a partir da entrada em vigor da norma revogadora. Regra em `private.normas_vigentes`, com testes de regressão em PGlite (`src/lib/legislacao/vigencia.test.ts`).
  - A parte por palavras tem duas listas: uma com todos os termos e outra com qualquer termo, com nota dividida pelo tamanho do trecho. A pergunta raramente usa as palavras da lei ("coeficiente" × "índice de aproveitamento").
  - Sem chave da Voyage, a busca é só por palavras.
  - O copiloto passa a citar a página do PDF.

### Extração assistida

- **Modelo e saída:** `claude-opus-5-5`, trocável por `INGESTAO_EXTRACAO_MODEL`, com saída estruturada (schema Zod, `output_config.format`) e prompt `extracao.v1`.
- **O que o modelo recebe:** o texto das páginas escolhidas (até 40), entre marcadores, como dado. O sistema proíbe completar com memória e manda ignorar instruções dentro do texto.
- **O que volta:** por zona, cada parâmetro com valor literal, valor normalizado, artigo, página, trecho e condição.
- **Conferências automáticas, sem I/O** (`src/lib/legislacao/extracao.ts`):
  - formato;
  - unidade (taxa → fração);
  - recuo na DSL de fórmulas;
  - faixa;
  - trecho localizado no texto da página ou vizinhas, tolerando acento, espaço, pontuação e hifenização.
  - Trecho não localizado vira aviso "conferir no PDF".
- **Resultado:** só rascunhos (`status = 'rascunho'`), ligados à execução (`extraction_runs`, com custo e saída bruta).
  - Zonas que a lei cita e o sistema não tem são listadas, e há opção de cadastrá-las sem geometria.
  - Os valores sugeridos ficam em `zoning_rules.extracted_values`. A taxa de acerto é medida contra a regra homologada.

### Revisão e homologação

- **Por campo, na página da regra:** sugestão da IA, regra validada atual (diferença destacada), página do PDF com link, conferência do trecho e condição ou exceção.
- **Conflito de fontes:** valor diferente da regra validada atual, vindo de outra norma, exige "resolução do conflito" antes de validar (`src/lib/legislacao/conflitos.ts`).
- **Alterações posteriores:** `legal_document_links` registra que a norma X altera, revoga, regulamenta ou consolida a Y. A regra cuja fonte foi alterada mostra o aviso.
- **Nota de homologação obrigatória** para validar: quem conferiu e com base em quê. A IA nunca valida.

### Cartografia oficial e dados fictícios

- **Importação por URL** (Fortaleza em Mapas, Ipplan/SEUMA):
  - **Zonas:** uma por valor do atributo escolhido, com siglas propostas e editáveis. Feições de mesmo nome são unidas e a geometria é corrigida no banco (`ST_MakeValid`). Os atributos da camada (no zoneamento de Fortaleza, CA/TO/altura por zona) entram na descrição da zona como fonte secundária para conferência.
  - **Condicionantes** (`environmental_layers`): uma linha por feição, com tipo e fonte. Reimportar a mesma fonte substitui a anterior.
- **Limites do Supabase:** o banco corta instruções em 8 s, então os lotes são pequenos: uma zona por chamada e até ~800 KB por lote de camada.
- **Arquivamento dos fictícios:** `archived_at` em zonas, camadas, terrenos, comparáveis e leis tira os dados de teste das funções espaciais, da busca, do copiloto e dos estudos. É reversível (`admin_arquivar_ficticios`).
- **Terreno arquivado não é estudado**, nem com o UUID informado direto (`estudarTerreno` e `carregarContexto`). **Relatórios de terreno fictício ou arquivado** ficam só para administradores, com o selo "Dados de teste": RLS de `reports` (`private.terreno_de_teste`) e `revisoes_do_relatorio`. Relatórios reais e de ponto não mudam.
- **Ponto sem zona urbana dentro de camada municipal** (ex.: ZPA do Cocó): o município passa a vir da camada.

### Relatórios, camadas e mercado (Blueprint v2.2)

- **Relatório desatualizado:** cada estudo guarda a zona usada (gatilho em `analysis_runs`).
  - Quando a regra daquela zona × uso entra ou sai de "validado", os relatórios afetados ganham `stale_since` e o motivo.
  - O aviso aparece na página e na lista. PDFs já exportados não mudam.
  - O gatilho é SECURITY DEFINER porque o admin muda a regra, mas os relatórios são de outras organizações. Ele só grava a marca.
- **Camada ausente não é "sem restrição":** o motor recebe os tipos de restrição sem camada oficial no município e devolve o aviso de "dados insuficientes". Os números não mudam (motor 0.1.0).
- **Indicadores agregados de mercado** (CPES do Sinduscon-CE, 2º trimestre de 2026):
  - O que entra: preço médio de tabela por m² privativo, IVV e oferta por bairro, e o agregado do município, com fonte e página.
  - Uso: `consultar_mercado` devolve esses dados como contexto e avisa que não são preço do estudo.
  - Por que só uso interno: não há microdados nem direito de redistribuição (`internal_only`).
  - Até a confirmação dos direitos com o Sinduscon-CE, só administradores leem os indicadores: na RLS de `market_indicators` e na ferramenta do chat (`usuarioEhAdmin`). Migration `20261016070000`.
  - Onde não entram: relatório, PDF e link público usam só a entrada do motor, então os indicadores ficam de fora.
  - Os dados foram carregados direto no banco e não estão no repositório.
- **CUB-CE:** setembro/2026 vem da página do Sinduscon-CE, que confere com o valor de agosto já cadastrado.

### Prompts

Ficam em TypeScript (`src/server/legislacao/prompts.ts`), com versão registrada em cada execução. Assim entram no bundle das Server Actions sem configurar `outputFileTracingIncludes` por rota.

## Consequências

- **Sem fila:** OCR e índice andam em lotes chamados pela tela; fechar a aba para o processo, e clicar de novo retoma das páginas pendentes. Uma fila (cron ou Batches API, 50% mais barata) fica para quando houver volume.
- **Custo medido na LC 62/2009 (437 páginas escaneadas):**
  - OCR: ~US$ 0,013 a 0,021 por página, conforme a densidade do texto, ~US$ 7 no total. O tempo é dominado pelo modelo.
  - Extração de 6 páginas (16 zonas): US$ 0,42 em 110 s.
  - Números e comparação com o mapa oficial: `docs/validacao/ingestao-lc-62-2009.md`.
- **Texto compilado:** Fortaleza não publica o Plano Diretor compilado e atualizado (o do SAPL está "em edição"; o da PGM vai até 2015). A homologação precisa conferir as leis alteradoras, e o aviso na revisão ajuda nisso.
- **Mapa do terreno:** com milhares de feições oficiais, o mapa do cadastro de terreno deixa de desenhar as camadas (acima de 300). A interseção com o lote continua sendo calculada no banco.
- **Tipos de camada:** recurso hídrico, área de risco, ZEIS e ZEPH entram como "outra", com o nome explicando. Recurso hídrico não é APP: a faixa de APP depende do caso (Blueprint, p. 9), então o nome diz "verificar APP".
- **Avisos do linter do Supabase:** as novas funções `admin_*` são SECURITY INVOKER e conferem `is_admin()`, sem nada novo a declarar.

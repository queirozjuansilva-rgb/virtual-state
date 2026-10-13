# ADR 0009: Copiloto (chat com IA, ferramentas e evals)

- **Status:** aceita (prompt `copiloto.v2`; a v1 fica no repositório como histórico).
- **Data:** 2026-10-12

## Contexto

O PRD (Módulo 5) pede um chat com Claude, com streaming e tool use, que responde com cartões estruturados, usa o perfil do investidor e nunca calcula nem inventa parâmetro. O aceite da Fase 3 é: evals com pelo menos 90% de acerto, e "qual o recuo frontal do terreno X?" responde valor + lei/artigo ou declara a ausência.

## Decisão

### Modelo e API

- **Modelo:** `claude-sonnet-5-5` por padrão, trocável por `ANTHROPIC_MODEL`. Esforço em `COPILOTO_EFFORT` (padrão `medium`) e teto de saída em `COPILOTO_MAX_TOKENS`.
- **Chamada:** `client.beta.messages.stream` com thinking adaptativo. Betas usados:
  - `display: "updates"`: as notas de progresso entre ferramentas viram linhas de status na tela.
  - `server-side-fallback-2026-07-01` com `fallbacks: "default"`: recusa de classificador é refeita no servidor em outro modelo (só nas categorias que a Anthropic cobre).
  - `thinking-binding-controls-2026-08-01` com `prefix_mismatch_behavior: "drop_block"`: se o histórico mudar, o pedido continua sem o raciocínio antigo em vez de falhar.
- **Histórico append-only:**
  - O system prompt e a lista de ferramentas ficam congelados. O prompt tem `cache_control`, e há cache automático no topo do pedido.
  - O conteúdo do assistente é gravado em `messages` exatamente como a API devolveu (thinking com assinatura, blocos de fallback).
  - O contexto dinâmico do turno vai numa mensagem `role: "system"` depois da pergunta: data, usuário, perfil do investidor, terreno em foco, ponto do mapa e anexos.
- **Paradas:**
  - `refusal`: grava um aviso e responde com erro as chamadas pendentes.
  - `max_tokens` com ferramenta: a entrada truncada não é executada.
  - `pause_turn`: continua o passo.
  - Limite de 8 passos por turno. No último, a ferramenta é desligada (`tool_choice: none`) e uma mensagem de sistema pede o fechamento.

### Ferramentas (`src/lib/ai/tools`)

São 11, em ordem fixa:

| Ferramenta                          | O que faz                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `buscar_terrenos`                   | Busca terrenos do land bank por filtros.                                     |
| `obter_terreno`                     | Ficha do terreno, com restrições.                                            |
| `localizar_endereco`                | Endereço digitado → candidatos com coordenadas, precisão e zona.             |
| `identificar_zona`                  | Zona de um terreno ou de um ponto.                                           |
| `consultar_parametros_urbanisticos` | Só regras validadas, com lei e artigo de cada campo.                         |
| `buscar_legislacao`                 | Texto da lei (FTS por enquanto; RAG na Fase 5), marcado como não validado.   |
| `consultar_mercado`                 | Comparáveis e CUB.                                                           |
| `calcular_viabilidade`              | Motor, ranking de melhor uso e `analysis_run` gravado com `conversation_id`. |
| `comparar_terrenos`                 | Compara terrenos com o motor.                                                |
| `estudar_ponto`                     | Terreno fora do land bank: ponto + área + preço informados.                  |
| `solicitar_cobertura`               | Lead para o admin; só depois da confirmação do usuário.                      |

Cada ferramenta segue o mesmo contrato:

- **Entrada:** schema zod, convertido para JSON Schema (`z.toJSONSchema`) e validado de novo no servidor. O streaming antecipado (`eager_input_streaming`) deixa a validação com o servidor.
- **Saída:** devolve o `resultado` (JSON que o modelo lê), o `cartao` (o mesmo dado para a tela) e o `terrenoId` em foco. Os números vêm crus e formatados em pt-BR (`*_fmt`); o modelo cita os formatados.
- **Erros:** um erro esperado (`ErroFerramenta`) volta como `is_error` com uma mensagem útil. Um erro técnico vira uma mensagem genérica, sem detalhes internos.
- **Dados:** vêm de `DadosCopiloto` (`src/lib/ai/dados.ts`):
  - Em produção, o Supabase com o cliente do usuário (`src/server/copiloto/dados-supabase.ts`), então a RLS decide o que ele vê.
  - Nos testes e evals, um snapshot do seed em memória (`src/lib/ai/evals/fixture`).
  - O contato do proprietário nunca passa por essa camada.

### Interface

- `/api/chat` devolve NDJSON. Cada linha é um `EventoChat`: conversa, passo, texto, progresso, ferramenta, cartão, foco, descartar, recusa, fim ou erro.
- A conversa começa em `/` e a URL vira `/chat/[id]` sem recarregar a página.
- O painel "Contexto do lote" usa as mesmas ferramentas (ficha, parâmetros validados, mercado) e mostra o polígono no mapa.
- Histórico na barra lateral, com renomear e excluir. Perfil do investidor em `/perfil`.
- **Anexos:**
  - O arquivo fica no Storage (`chat-attachments`, pasta do usuário) e vai uma vez para a Files API.
  - O nome na Files API tem o prefixo do usuário. O servidor confere esse prefixo antes de usar o `file_id`, porque o `file_id` vale para a organização inteira na Anthropic.
  - O usuário só pode alterar `message_id` do anexo (privilégio por coluna).
- **Localização:** clique no mapa (alfinete do compositor) ou endereço digitado no chat; a ferramenta `localizar_endereco` geocodifica pela MapTiler (ver abaixo).

### Geocodificação

- **Serviço:** API de geocodificação da MapTiler (`src/server/geo/maptiler.ts`), restrita ao Brasil, em português, até 3 candidatos. Usa a mesma `NEXT_PUBLIC_MAPTILER_KEY` do mapa.
- **Chave restrita por domínio:** o pedido sai do servidor com `Origin`/`Referer` do `NEXT_PUBLIC_SITE_URL`, para funcionar com a chave limitada aos domínios do app.
- **Precisão:** só é "endereço exato" o resultado que chegou ao número do imóvel. Candidatos com relevância abaixo de 0,6 são descartados (a busca aproximada devolve ruas parecidas em outras cidades).
- **Uso:** sem chave, a ferramenta orienta a marcar o ponto no mapa. Nos testes e evals, a fixture responde a endereços fictícios ("Rua de Teste K/L") que caem nos pontos do seed.

### Prompt e evals

- **Prompt:** `src/lib/ai/prompts/copiloto.v2.md`, com papel, regras, fontes (validado × texto de lei × premissa), falta de dado, perfil, formato, defesa contra injeção, escopo e 5 few-shots. Mudar o texto significa criar uma versão nova e rodar os evals. A v2 acrescentou a regra de endereço: usar `localizar_endereco`, confirmar o local quando a precisão não for de endereço exato e dizer que a zona vale para o ponto localizado.
- **Evals:** `npm run evals`.
  - 25 casos em `src/lib/ai/evals/casos.ts`, com o modelo real sobre o snapshot do seed.
  - Um caso passa quando chamou as ferramentas esperadas, não chamou as proibidas e o texto bate com os padrões.
  - Todo número relevante da resposta precisa aparecer numa ferramenta, na pergunta ou no contexto (tolerância de 1% para arredondamento).
  - O relatório vai para `docs/validacao/evals-copiloto.md`. Meta: 90%.

## Consequências

- **Custo e testes:** os evals gastam API (cerca de 25 turnos por rodada) e precisam de `ANTHROPIC_API_KEY`. Os testes unitários usam um cliente falso e o snapshot, então rodam no CI sem custo.
- **Fallback:** a recusa refeita em outro modelo roda sem o raciocínio do Sonnet 5.5, o que é aceitável para o chat.
- **Fora desta fase:**
  - `recomendar_terrenos` (matchmaking) fica para a Fase 6; hoje a recomendação usa `buscar_terrenos` + `comparar_terrenos` + perfil.
  - `gerar_relatorio` fica para a Fase 4.
  - O rate limit fica para a Fase 6.
- **Snapshot dos evals:** se o seed mudar, regenere `src/lib/ai/evals/fixture/seed.json`.

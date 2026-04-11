# N8N Sofia Flow Audit (2026-02-13)

Workflow analisado:
- `id`: `mE2C2CFLyixzvnZX`
- `name`: `ZAPI - PROGRESSO- SOFIA`
- `active`: `true`
- `nodes`: `114`
- `main edges`: `126`
- trigger: `POST https://webhook.iagoflow.com/webhook/sofia`

Fontes locais geradas:
- `/.agent/n8n_workflow_mE2C2CFLyixzvnZX.json`
- `/.agent/n8n_workflow_graph_audit.json`
- `/.agent/n8n_nodes_audit.csv`
- `/.agent/n8n_key_nodes_parameters.txt`
- `/.agent/n8n_ai_nodes_parameters.txt`

## 1) Logica atual (resumo real)

1. `Webhook` recebe evento.
2. Filtros iniciais: `FromE?` -> `@lid1` -> `Meu numero ?1` -> `If14` -> `E GRUPO?`/`If10` -> `E GRUPO?4`.
3. Normalizacao: `SETA O NUMERO PARA FILTRAR1` -> `PADRONIZA O NUMERO` -> `CREDECIAMENTO1`.
4. Whitelist e comandos: `If9` (telefones), `DELETAR A MEMORIA?1`, `DELETAR A MEMORIA?`, `If`.
5. Roteamento de tipo de mensagem: `QUAL O TIPO DE MENSAGEM?1` (texto, audio, imagem, aguardando, documento, video, botao).
6. Enriquecimento por midia: `BUSCA O ARQUIVO*`, `Transcribe*`, `Analyze*`, `Extract from File`.
7. Preparacao unica: `SETA OS CAMPOS1` -> `Filtra Webhook` -> `Wait2` -> `Form Me` -> `Pausar ou Ativar`.
8. Estado e memoria: Redis/Supabase + `Chat Memory Manager`.
9. Resposta IA:
   - `AI Agent1` (principal, multi-tool)
   - `AI Agent` (fluxo paralelo de disparo/formulario)
10. Pos-processamento e envio: `If1`, `If13`, `SETA O ARRAY1`, `SEPARA AS MSGS*`, `Loop Over Items1`, `ENVIA MENSAGEM6/7`.
11. Tratamento de erro: `Error Trigger` -> `Call 'ERRO'`.

## 2) Achados criticos

1. Branches orfas (17 nos) sem caminho valido do trigger principal.
2. Duplicidade de regras:
   - `DELETAR A MEMORIA?` e `DELETAR A MEMORIA?1` com a mesma condicao.
   - `If11` e `If12` com estrutura equivalente.
   - `E GRUPO?` e `E GRUPO?4` com estrutura equivalente.
3. `If9` (whitelist) tem telefone repetido e lista hardcoded grande.
4. `Pausar ou Ativar` tem regra duplicada de "Especialista"/"especialista", mas ja usa `ignoreCase`.
5. `AI Agent1` conectado a dois LLMs (`OpenAI` e `Gemini`) no mesmo agente, aumentando variabilidade e custo.
6. Prompt de `AI Agent1` muito grande (`systemMessage` ~13.6k chars), com risco de latencia/custo e perda de aderencia.
7. Webhook sem credencial obrigatoria (exposto), dependente so de filtros internos.

## 3) Nos orfaos (candidatos a remocao)

- `@lid`
- `Data Handler`
- `Number Filter3`
- `Filter`
- `Data Handler4`
- `Number Filter4`
- `Create a row3`
- `Get a row7`
- `Get a row8`
- `If11`
- `If12`
- `PADRONIZA O NUMERO3`
- `SETA O NUMERO PARA FILTRAR3`
- `Redis2`
- `Redis3`
- `If2`
- `Create a row1`

## 4) Melhorias de baixo risco (aplicar primeiro)

1. Limpar os 17 nos orfaos.
2. Em `If9`, remover telefone duplicado e mover whitelist para uma fonte externa (Data Store, Supabase ou env).
3. Em `Pausar ou Ativar`, remover regra redundante de caixa alta/baixa.
4. Manter apenas 1 LLM em `AI Agent1` (sugestao: OpenAI OU Gemini, nao ambos).
5. Transformar o prompt de `AI Agent1` em "core prompt + regras curtas por bloco" para reduzir tokens.
6. Inserir um gate de seguranca no inicio (token/header signature) antes de qualquer processamento.

## 5) Melhorias de medio impacto (fase 2)

1. Extrair parser de midia para subworkflow reutilizavel.
2. Unificar caminho de output:
   - padrao de payload unico antes do envio
   - separar bloco de split/envio em subworkflow.
3. Revisar `Wait*` para reduzir tempo medio de resposta.
4. Trocar validacoes textuais frageis (`contains`, `print(default`) por saida estruturada JSON do agente.

## 6) Plano de rollout seguro

1. Clonar workflow atual para `ZAPI - PROGRESSO - SOFIA v2`.
2. Aplicar apenas melhorias de baixo risco.
3. Rodar teste de regressao com 10 cenarios:
   - texto normal
   - audio
   - imagem
   - documento
   - video
   - comando `##memoria##`
   - comando `##disparo##`
   - lead aguardando
   - erro interno
   - notificacao atendente
4. Ativar v2 em janela controlada e monitorar taxa de erro, latencia e custo.

## 7) Resultado esperado apos refactor inicial

- Menos complexidade operacional.
- Menos custo de token/LLM.
- Menos risco de comportamento imprevisivel.
- Manutencao mais simples e auditavel.

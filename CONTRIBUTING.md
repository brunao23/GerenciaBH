# Guia de Contribuição - GerencIA

Obrigado por investir seu tempo em contribuir para o **GerencIA**! Toda ajuda em engenharia, otimização e melhorias na IA é muito bem-vinda.

Para garantir a estabilidade em produção da nossa plataforma SaaS Multi-Tenant, exigimos o cumprimento rigoroso destas diretrizes.

## Leitura Obrigatória (Source of Truth)
Antes de abrir uma branch ou propor qualquer código, **VOCÊ DEVE LER** o documento base do projeto:
👉 **[CONTEXT.md](./CONTEXT.md)**

Nele estão mapeados o modelo Multi-Tenant, o fluxo de Webhooks, as lógicas do Orquestrador de IA e a sincronização com Google Calendar.

## Padrões de Código (Strict Guidelines)
1. **TypeScript Rigoroso:** É terminantemente **PROIBIDO** o uso de `any`, `@ts-ignore` ou `@ts-expect-error` para contornar problemas de tipagem. A tipagem deve ser resolvida estruturalmente.
2. **Multi-Tenant First:** Todo código de banco de dados deve usar o helper `getTablesForTenant(prefix)`. Queries genéricas ou hardcoded causarão falha imediata no Code Review.
3. **Instalação de Dependências:** Devido ao React 19, sempre instale pacotes localmente usando a flag de peer dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
4. **Variáveis de Ambiente:** Nenhuma chave de API, token ou secret deve transitar no Frontend (ex: nunca expor chaves da OpenAI, Vertex AI ou Service Role do Supabase ao cliente).

## Fluxo de Commits (Conventional Commits)
Siga o padrão Semantic Versioning para commits:
* `feat:` Uma nova funcionalidade
* `fix:` Correção de um bug
* `docs:` Alterações exclusivas na documentação
* `refactor:` Mudança de código que não corrige bug nem adiciona funcionalidade
* `perf:` Mudança focada em performance

Exemplo: `fix: garante que pausa manual zere campo paused_until`

## Processo de Pull Request
1. Faça o checkout em uma nova branch (`feature/nome-da-sua-feature` ou `fix/nome-do-bug`).
2. Escreva o código seguindo as restrições arquiteturais.
3. Garanta que seu código passa no lint e no build (`npm run build`).
4. Abra um Pull Request utilizando o template oficial do repositório (`PULL_REQUEST_TEMPLATE.md`).
5. Solicite review de pelo menos um Arquiteto Sênior (ou líder do projeto).

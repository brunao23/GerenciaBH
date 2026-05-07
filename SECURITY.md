# Política de Segurança (Security Policy)

A segurança dos dados de nossos clientes (Tenants) e a integridade da nossa infraestrutura em nuvem são prioridades absolutas na **Genial Labs AI**.

## Versões Suportadas
Este é um projeto SaaS com Deploy Contínuo (CI/CD). A única versão suportada e que recebe correções de segurança é a **versão atual em produção (`main`)**.

## Como Reportar uma Vulnerabilidade (NÃO ABRA ISSUE PÚBLICA)
Devido à natureza Multi-Tenant e o risco de vazamento de dados de clientes PII (Personally Identifiable Information) e PHI (Protected Health Information), tratamos problemas de segurança com extrema confidencialidade.

**⚠️ NUNCA CRIE UMA ISSUE PÚBLICA NO GITHUB PARA REPORTAR UMA VULNERABILIDADE.**

Se você descobriu uma falha de segurança, violação de RLS no Supabase, vazamento de credenciais (LLMs, JWT, Keys) ou comportamento indesejado em nossos orquestradores de IA:

1. Envie um e-mail imediatamente para **security@geniallabs.ai** (ou diretamente aos líderes do projeto).
2. Inclua o máximo de informações possível:
   - Descrição detalhada do vetor de ataque.
   - Passos para reproduzir a falha.
   - Módulo afetado (ex: Webhook Z-API, JWT Isolator, Supabase Policy).
3. Aguarde o retorno de um dos nossos engenheiros seniores antes de comentar o assunto com terceiros.

Agradecemos imensamente por nos ajudar a manter a plataforma GerencIA segura.

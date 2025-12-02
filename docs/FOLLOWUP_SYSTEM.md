# 🚀 Sistema de Follow-up Automatizado - Documentação

## 📋 Variáveis de Ambiente Necessárias

Adicione no seu arquivo `.env.local`:

```env
# OpenAI (para análise contextual de IA nos follow-ups)
OPENAI_API_KEY=sk-...

# Cron Secret (para proteger a rota de cron)
CRON_SECRET=um-token-secreto-forte-aleatorio
```

## 🗄️ Migração do Banco de Dados

1. Execute a migration SQL:
```bash
# Se estiver usando Supabase localmente
supabase db reset

# Ou execute o SQL manualmente no Supabase Dashboard:
# supabase/migrations/20251120_create_followup_system.sql
```

## ⚙️ Configuração da Evolution API

### Via Interface (Recomendado)
1. Acesse `/configuracoes` no sistema
2. Vá até a aba "Follow-up Automatizado"
3. Preencha:
   - **API URL**: URL da sua Evolution API (ex: `https://api.example.com`)
   - **Nome da Instância**: Nome da instância configurada
   - **Token**: Token de API da Evolution
   - **Número do WhatsApp**: Número que enviará as mensagens (formato: 5511999999999)

### Como Obter Credenciais Evolution API

1. **API URL**: Endereço do servidor da Evolution API
2. **Instância**: Criada no painel da Evolution API
3. **Token**: Gerado ao criar a instância
4. **Número**: WhatsApp conectado à instância

## 🔄 Como Funciona o Sistema

### 1. Detecção Automática
- Quando um lead para de responder, o sistema detecta automaticamente
- Um agendamento de follow-up é criado

### 2. Análise Contextual com IA
- A IA analisa todo o histórico da conversa
- Determina se faz sentido enviar follow-up
- Gera mensagem personalizada baseada no contexto

###3. Intervalos Progressivos
O sistema envia follow-ups nos seguintes intervalos:

| Tentativa | Intervalo | Objetivo |
|-----------|-----------|----------|
| 1ª | 10 minutos | Retomada rápida |
| 2ª | 1 hora | Lembrete suave |
| 3ª | 6 horas | Reforço de interesse |
| 4ª | 24 horas (1 dia) | Retomada do dia seguinte |
| 5ª | 72 horas (3 dias) | Follow-up de médio prazo |
| 6ª | 7 dias (1 semana) | Última tentativa |

### 4. Processamento Automático
- Rota de cron roda a cada 5 minutos
- Verifica follow-ups vencidos
- Envia mensagens via Evolution API
- Atualiza status e agenda próxima tentativa

## 🎯 APIs Disponíveis

### Configuração da Evolution API
```http
GET    /api/followup/config     # Buscar configuração
POST   /api/followup/config     # Salvar configuração
DELETE /api/followup/config     # Remover configuração
```

### Gerenciamento de Follow-ups
```http
GET    /api/followup/schedule?session=xxx&status=active
POST   /api/followup/schedule   # Agendar novo follow-up
DELETE /api/followup/schedule?session=xxx
```

### Cron (Automático)
```http
GET /api/followup/cron
Authorization: Bearer {CRON_SECRET}
```

## 📊 Monitoramento

### Via SQL
```sql
-- Ver follow-ups ativos
SELECT * FROM followup_monitor;

-- Histórico de envios
SELECT * FROM followup_logs ORDER BY sent_at DESC LIMIT 50;

-- Follow-ups vencidos
SELECT * FROM followup_schedule 
WHERE next_followup_at <= NOW() 
AND is_active = true;
```

### Via API
```bash
# Follow-ups ativos
curl http://localhost:3000/api/followup/schedule?status=active

# Por sessão específica
curl http://localhost:3000/api/followup/schedule?session=5511999999999
```

## 🛠️ Desenvolvimento Local

### Testar Cron Manualmente
```bash
curl -X POST http://localhost:3000/api/followup/cron \
  -H "Authorization: Bearer seu-cron-secret"
```

### Agendar Follow-up para Teste
```bash
curl -X POST http://localhost:3000/api/followup/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "5511999999999@s.whatsapp.net",
    "phoneNumber": "5511999999999",
    "leadName": "Teste",
    "lastMessage": "Mensagem de teste",
    "conversationHistory": [],
    "funnelStage": "entrada"
  }'
```

## 🔐 Segurança

1. **Cron Secret**: Protege a rota de cron de acessos não autorizados
2. **Evolution API Token**: Mantido criptografado no banco
3. **Análise IA**: Evita spam detectando desinteresse do lead

## 📱 Integração com CRM

O sistema se integra automaticamente com:
- **Painel de Conversas**: Mostra status de follow-up ativo
- **CRM**: Exibe quando follow-up está agendado
- **Relatórios**: Métricas de conversão via follow-up

## ⚡ Performance

- Processa até 50 follow-ups por execução do cron
- Delay de 2 segundos entre envios (evita spam)
- Máximo de 6 tentativas por lead
- Cancelamento automático quando lead responde

## 🐛 Troubleshooting

### Follow-ups não estão sendo enviados
1. Verifique se a Evolution API está ativa
2. Confirme que o cron está rodando
3. Veja logs em `followup_logs`

### IA não está analisando
1. Confirme `OPENAI_API_KEY` no `.env`
2. Verifique créditos da OpenAI
3. Veja campo `ai_context_analysis` nos logs

### Mensagens duplicadas
1. Only o cron deve rodar a cada 5 minutos
2. Verifique configuração do `vercel.json`

## 📈 Próximas Melhorias

- [ ] Dashboard visual de follow-ups
- [ ] A/B testing de mensagens
- [ ] Webhooks de resposta em tempo real
- [ ] Templates personalizáveis por usuário
- [ ] Relatório de taxa de conversão por follow-up

---

**Desenvolvido com ❤️ para GerenciaIA**

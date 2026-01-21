# 🤖 APIs DE MACHINE LEARNING - GUIA DE USO

## 📋 APIS DISPONÍVEIS

### 1. Análise de Sentimento
### 2. Classificação de Leads

---

## 1️⃣ ANÁLISE DE SENTIMENTO

### Endpoint: `/api/ml/sentiment`

**Analisa o sentimento das mensagens de um lead**

### GET - Analisar um lead

```typescript
// Request
GET /api/ml/sentiment?leadId=5511999999999@c.us

// Response
{
  "leadId": "5511999999999@c.us",
  "totalMessages": 15,
  "sentiment": {
    "overall": "positive",           // positive | neutral | negative
    "score": 0.65,                    // -1 a 1
    "confidence": 80,                 // 0-100%
    "trend": "improving",             // improving | stable | declining
    "lastMessageSentiment": "positive"
  },
  "timestamp": "2026-01-21T00:00:00Z"
}
```

### POST - Analisar múltiplos leads

```typescript
// Request
POST /api/ml/sentiment
{
  "leadIds": [
    "5511999999999@c.us",
    "5511888888888@c.us"
  ]
}

// Response
{
  "total": 2,
  "results": [
    {
      "leadId": "5511999999999@c.us",
      "totalMessages": 15,
      "sentiment": { ... }
    },
    {
      "leadId": "5511888888888@c.us",
      "totalMessages": 8,
      "sentiment": { ... }
    }
  ],
  "timestamp": "2026-01-21T00:00:00Z"
}
```

### Interpretação dos Resultados

**Overall Sentiment:**
- `positive` - Lead está satisfeito e engajado
- `neutral` - Lead neutro, sem sinais claros
- `negative` - Lead insatisfeito ou desinteressado

**Score:**
- `> 0.5` - Muito positivo
- `0.2 a 0.5` - Positivo
- `-0.2 a 0.2` - Neutro
- `-0.5 a -0.2` - Negativo
- `< -0.5` - Muito negativo

**Trend:**
- `improving` - Sentimento melhorando ao longo do tempo
- `stable` - Sentimento estável
- `declining` - Sentimento piorando

**Confidence:**
- `> 80%` - Alta confiança
- `50-80%` - Média confiança
- `< 50%` - Baixa confiança (poucos dados)

---

## 2️⃣ CLASSIFICAÇÃO DE LEADS

### Endpoint: `/api/ml/classify`

**Classifica automaticamente o status do lead no funil**

### GET - Classificar um lead

```typescript
// Request
GET /api/ml/classify?leadId=5511999999999@c.us

// Response
{
  "leadId": "5511999999999@c.us",
  "classification": {
    "status": "qualificacao",
    "confidence": 80,
    "reasoning": [
      "Alto interesse e engajamento",
      "5 sinais de interesse",
      "3 perguntas feitas"
    ]
  },
  "features": {
    "totalMessages": 15,
    "messagesFromLead": 8,
    "messagesFromAI": 7,
    "daysSinceFirstContact": 3,
    "daysSinceLastContact": 0,
    "hasScheduling": false,
    "hasFollowup": true,
    "mentionedPrice": true,
    "mentionedWhen": true,
    "askedQuestions": 3,
    "positiveSignals": 5,
    "negativeSignals": 0,
    "interestSignals": 5,
    "urgencySignals": 2
  },
  "timestamp": "2026-01-21T00:00:00Z"
}
```

### POST - Classificar múltiplos leads

```typescript
// Request
POST /api/ml/classify
{
  "leadIds": [
    "5511999999999@c.us",
    "5511888888888@c.us"
  ]
}

// Response
{
  "total": 2,
  "results": [
    {
      "leadId": "5511999999999@c.us",
      "classification": { ... },
      "features": { ... }
    },
    {
      "leadId": "5511888888888@c.us",
      "classification": { ... },
      "features": { ... }
    }
  ],
  "timestamp": "2026-01-21T00:00:00Z"
}
```

### Status Possíveis

- `entrada` - Lead novo, sem classificação clara
- `atendimento` - Lead ativo e engajado
- `qualificacao` - Lead qualificado, alto interesse
- `agendado` - Lead com agendamento confirmado
- `ganhos` - Lead com sinais fortes de fechamento
- `perdido` - Lead perdido (sinais negativos)
- `sem_resposta` - Lead sem resposta há mais de 7 dias

### Regras de Classificação

1. **Agendado** (95% confiança)
   - Tem agendamento confirmado

2. **Sem Resposta** (85% confiança)
   - Sem resposta há mais de 7 dias
   - Nenhuma mensagem do lead

3. **Perdido** (75% confiança)
   - Mais de 3 sinais negativos
   - OU inatividade > 14 dias com < 3 mensagens

4. **Qualificação** (80% confiança)
   - 3+ sinais de interesse
   - 2+ perguntas feitas

5. **Atendimento** (70% confiança)
   - 2+ mensagens do lead
   - Última interação < 3 dias

6. **Ganho** (65% confiança)
   - 5+ sinais positivos
   - 2+ sinais de urgência
   - Mencionou preço

---

## 💡 CASOS DE USO

### 1. Dashboard com Insights de ML

```typescript
// Buscar todos os leads
const leads = await fetchLeads()

// Classificar em lote
const classifications = await fetch('/api/ml/classify', {
  method: 'POST',
  body: JSON.stringify({
    leadIds: leads.map(l => l.id)
  })
})

// Analisar sentimento em lote
const sentiments = await fetch('/api/ml/sentiment', {
  method: 'POST',
  body: JSON.stringify({
    leadIds: leads.map(l => l.id)
  })
})

// Mostrar no dashboard
leads.forEach(lead => {
  const classification = classifications.results.find(c => c.leadId === lead.id)
  const sentiment = sentiments.results.find(s => s.leadId === lead.id)
  
  console.log(`Lead ${lead.id}:`)
  console.log(`  Status sugerido: ${classification.status}`)
  console.log(`  Sentimento: ${sentiment.overall}`)
  console.log(`  Confiança: ${classification.confidence}%`)
})
```

### 2. Alertas Automáticos

```typescript
// Verificar leads com sentimento negativo
const sentiments = await fetchSentiments()

sentiments.results
  .filter(s => s.sentiment.overall === 'negative')
  .forEach(s => {
    alert(`⚠️ Lead ${s.leadId} está com sentimento negativo!`)
  })

// Verificar leads em risco
const classifications = await fetchClassifications()

classifications.results
  .filter(c => c.classification.status === 'perdido')
  .forEach(c => {
    alert(`🚨 Lead ${c.leadId} está em risco de perda!`)
  })
```

### 3. Sugestões de Ação

```typescript
const classification = await fetch(`/api/ml/classify?leadId=${leadId}`)
const sentiment = await fetch(`/api/ml/sentiment?leadId=${leadId}`)

// Sugerir ação baseada em ML
if (sentiment.overall === 'negative' && sentiment.trend === 'declining') {
  suggestAction('Entrar em contato urgentemente para resolver insatisfação')
}

if (classification.status === 'qualificacao' && sentiment.overall === 'positive') {
  suggestAction('Lead pronto para agendamento! Oferecer horários disponíveis.')
}

if (classification.status === 'sem_resposta') {
  suggestAction('Enviar follow-up automático')
}
```

---

## 🚀 PRÓXIMOS PASSOS

### Melhorias Futuras:

1. **Modelo de ML Real**
   - Treinar com dados históricos
   - Usar XGBoost ou Random Forest
   - Melhorar acurácia

2. **Mais Features**
   - Análise de horários
   - Padrões de comportamento
   - Histórico de conversões

3. **API de Predição de Conversão**
   - Probabilidade de conversão (0-100%)
   - Valor estimado do lead
   - Tempo estimado para conversão

4. **API de Recomendação**
   - Melhor momento para follow-up
   - Melhor mensagem para enviar
   - Melhor ação a tomar

---

**APIS DE ML PRONTAS PARA USO!** 🤖✅

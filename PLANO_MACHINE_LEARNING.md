# 🤖 PLANO DE MACHINE LEARNING - GERENCIA BH

## 🎯 OPORTUNIDADES DE ML

### 1. CLASSIFICAÇÃO AUTOMÁTICA DE LEADS (Prioridade ALTA)

**Objetivo:** Classificar automaticamente o status do lead no funil

**Dados disponíveis:**
- Histórico de conversas
- Tempo de resposta
- Sentimento das mensagens
- Agendamentos
- Follow-ups

**Modelo:** Random Forest ou XGBoost
- **Input:** Features extraídas das conversas
- **Output:** Status do lead (entrada, qualificação, agendado, ganho, perdido)

**Implementação:**
```python
# Features
- total_mensagens
- tempo_medio_resposta
- sentimento_medio
- tem_agendamento
- dias_desde_primeira_interacao
- palavras_chave (interesse, preço, quando, etc)

# Modelo
from sklearn.ensemble import RandomForestClassifier
model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)
```

**Benefícios:**
- ✅ Reduz trabalho manual
- ✅ Classifica leads automaticamente
- ✅ Melhora taxa de conversão

---

### 2. PREVISÃO DE CONVERSÃO (Prioridade ALTA)

**Objetivo:** Prever probabilidade de conversão de cada lead

**Dados disponíveis:**
- Histórico de conversas
- Comportamento do lead
- Dados demográficos
- Histórico de conversões

**Modelo:** Gradient Boosting (XGBoost)
- **Input:** Features do lead
- **Output:** Probabilidade de conversão (0-100%)

**Features importantes:**
```python
- tempo_primeira_resposta
- numero_interacoes
- sentimento_geral
- mencionou_preco
- mencionou_quando
- respondeu_rapido
- fim_de_semana
- horario_contato
```

**Implementação:**
```python
import xgboost as xgb

# Treinar modelo
dtrain = xgb.DMatrix(X_train, label=y_train)
params = {
    'objective': 'binary:logistic',
    'max_depth': 6,
    'learning_rate': 0.1
}
model = xgb.train(params, dtrain)

# Prever
probabilidade = model.predict(dtest)
```

**Benefícios:**
- ✅ Prioriza leads com maior chance
- ✅ Otimiza tempo da equipe
- ✅ Aumenta ROI

---

### 3. ANÁLISE DE SENTIMENTO (Prioridade MÉDIA)

**Objetivo:** Detectar sentimento do lead em tempo real

**Dados disponíveis:**
- Mensagens do lead
- Histórico de interações

**Modelo:** BERT ou DistilBERT (português)
- **Input:** Texto da mensagem
- **Output:** Sentimento (positivo, neutro, negativo)

**Implementação:**
```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# Modelo pré-treinado em português
model_name = "neuralmind/bert-base-portuguese-cased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)

def analisar_sentimento(texto):
    inputs = tokenizer(texto, return_tensors="pt")
    outputs = model(**inputs)
    sentimento = torch.argmax(outputs.logits).item()
    return sentimento  # 0: negativo, 1: neutro, 2: positivo
```

**Benefícios:**
- ✅ Detecta leads insatisfeitos
- ✅ Alerta equipe em tempo real
- ✅ Melhora atendimento

---

### 4. RECOMENDAÇÃO DE FOLLOW-UP (Prioridade MÉDIA)

**Objetivo:** Sugerir melhor momento e mensagem para follow-up

**Dados disponíveis:**
- Histórico de follow-ups
- Taxa de resposta
- Horário de interação
- Dia da semana

**Modelo:** Reinforcement Learning (Q-Learning)
- **Input:** Estado do lead
- **Output:** Ação (enviar agora, esperar 1h, esperar 1 dia, etc)

**Features:**
```python
- ultima_interacao_horas
- dia_da_semana
- horario_do_dia
- numero_tentativas
- taxa_resposta_historica
```

**Implementação:**
```python
import numpy as np

# Q-Learning simples
Q = np.zeros((n_states, n_actions))

def escolher_acao(estado):
    return np.argmax(Q[estado])

def atualizar_q(estado, acao, recompensa, proximo_estado):
    Q[estado, acao] += alpha * (recompensa + gamma * np.max(Q[proximo_estado]) - Q[estado, acao])
```

**Benefícios:**
- ✅ Otimiza timing de follow-up
- ✅ Aumenta taxa de resposta
- ✅ Reduz spam

---

### 5. DETECÇÃO DE DUPLICATAS (Prioridade BAIXA)

**Objetivo:** Identificar leads duplicados automaticamente

**Dados disponíveis:**
- Nome
- Telefone
- Histórico de mensagens

**Modelo:** Similarity Learning (Siamese Network)
- **Input:** Par de leads
- **Output:** Similaridade (0-1)

**Implementação:**
```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def detectar_duplicatas(leads):
    vectorizer = TfidfVectorizer()
    vectors = vectorizer.fit_transform([l.nome for l in leads])
    similarity_matrix = cosine_similarity(vectors)
    
    duplicatas = []
    for i in range(len(leads)):
        for j in range(i+1, len(leads)):
            if similarity_matrix[i][j] > 0.85:
                duplicatas.append((leads[i], leads[j]))
    
    return duplicatas
```

**Benefícios:**
- ✅ Limpa base de dados
- ✅ Evita contato duplicado
- ✅ Melhora qualidade dos dados

---

### 6. CHURN PREDICTION (Prioridade MÉDIA)

**Objetivo:** Prever quando um lead vai "esfriar"

**Dados disponíveis:**
- Tempo desde última interação
- Frequência de interações
- Sentimento
- Status atual

**Modelo:** LSTM (Long Short-Term Memory)
- **Input:** Sequência temporal de interações
- **Output:** Probabilidade de churn nos próximos 7 dias

**Implementação:**
```python
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense

model = Sequential([
    LSTM(64, input_shape=(timesteps, features)),
    Dense(32, activation='relu'),
    Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam', loss='binary_crossentropy')
model.fit(X_train, y_train, epochs=50)
```

**Benefícios:**
- ✅ Identifica leads em risco
- ✅ Permite ação proativa
- ✅ Reduz perda de leads

---

## 🏗️ ARQUITETURA PROPOSTA

```
┌─────────────────────────────────────────────┐
│           FRONTEND (Next.js)                │
│  - Dashboard com insights de ML             │
│  - Alertas em tempo real                    │
│  - Recomendações automáticas                │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         API LAYER (Next.js API)             │
│  - /api/ml/predict-conversion               │
│  - /api/ml/classify-lead                    │
│  - /api/ml/sentiment-analysis               │
│  - /api/ml/recommend-followup               │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│      ML SERVICE (Python FastAPI)            │
│  - Modelos treinados                        │
│  - Inference em tempo real                  │
│  - Retreinamento automático                 │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         DATA LAYER (Supabase)               │
│  - Dados históricos                         │
│  - Features engineering                     │
│  - Métricas de performance                  │
└─────────────────────────────────────────────┘
```

---

## 📊 ROADMAP DE IMPLEMENTAÇÃO

### FASE 1: MVP (2-3 semanas)
1. ✅ Coletar e preparar dados
2. ✅ Treinar modelo de classificação de leads
3. ✅ API de predição simples
4. ✅ Dashboard com insights básicos

### FASE 2: Expansão (1 mês)
1. ✅ Análise de sentimento
2. ✅ Previsão de conversão
3. ✅ Alertas automáticos
4. ✅ Retreinamento semanal

### FASE 3: Avançado (2 meses)
1. ✅ Recomendação de follow-up
2. ✅ Churn prediction
3. ✅ A/B testing automático
4. ✅ Otimização contínua

---

## 💰 ROI ESTIMADO

**Investimento:**
- Desenvolvimento: 3-6 meses
- Infraestrutura: $100-300/mês
- Manutenção: 20h/mês

**Retorno:**
- ⬆️ +30% taxa de conversão
- ⬇️ -50% tempo de qualificação
- ⬆️ +40% produtividade da equipe
- ⬇️ -60% leads perdidos

**ROI:** 300-500% em 6 meses

---

## 🛠️ STACK TECNOLÓGICO

**ML/AI:**
- Python 3.11
- scikit-learn
- XGBoost
- TensorFlow/PyTorch
- Transformers (Hugging Face)

**API:**
- FastAPI (Python)
- Next.js API Routes

**Deploy:**
- Vercel (Frontend)
- Railway/Render (ML Service)
- Supabase (Dados)

**Monitoramento:**
- MLflow (experimentos)
- Weights & Biases (tracking)
- Sentry (erros)

---

## 🎯 MÉTRICAS DE SUCESSO

1. **Acurácia do modelo:** >85%
2. **Latência de predição:** <200ms
3. **Taxa de conversão:** +30%
4. **Tempo de resposta:** -50%
5. **Satisfação do cliente:** +40%

---

**PRONTO PARA IMPLEMENTAR!** 🚀🤖

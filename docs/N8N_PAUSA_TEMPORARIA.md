# Guia de Implementação: Pausa Temporária no N8N

Este guia explica como ajustar seu workflow no N8N para respeitar a nova funcionalidade de **Pausa Temporária**.

## O que mudou?

A tabela de pausas (`vox_es_pausar`, etc.) agora possui uma coluna chamada:
- `paused_until` (timestamp com timezone)

## Lógica de Verificação (Antes de responder)

Quando chegar uma mensagem de um lead, seu workflow deve consultar a tabela de pausas e aplicar a seguinte lógica:

### 1. Consulta SQL (Postgres Node)
```sql
SELECT pausar, paused_until 
FROM vox_es_pausar 
WHERE numero = '{{numero_formatado}}'
```

### 2. Node "IF" (Lógica de Decisão)

Você deve configurar um Node "IF" ou "Code" com a seguinte lógica para decidir se a IA deve responder (`true`) ou ficar quieta (`false`):

```javascript
// Exemplo em JavaScript (Node Code)
const lead = items[0].json;

// Se não tiver registro, responde (IA ativa por padrão)
if (!lead) return { json: { responder: true } };

// Se pausar for falso, responde
if (lead.pausar === false) return { json: { responder: true } };

// Se pausar for verdadeiro...
if (lead.pausar === true) {
    
    // Se paused_until for NULO, é pausa manual PERMANENTE -> NÃO RESPONDE
    if (lead.paused_until === null) return { json: { responder: false, motivo: "Pausa Permanente" } };
    
    const agora = new Date();
    const expiraEm = new Date(lead.paused_until);
    
    // Se a data de expiração for MAIOR que agora -> AINDA ESTÁ PAUSADO -> NÃO RESPONDE
    if (expiraEm > agora) {
        return { json: { responder: false, motivo: "Pausa Temporária Ativa" } };
    }
    
    // Se a data de expiração for MENOR que agora -> PAUSA EXPIROU -> PODE RESPONDER
    // (Opcional: Você pode adicionar um passo para atualizar pausar=false no banco)
    return { json: { responder: true, motivo: "Pausa Expirada" } };
}
```

## Resumo Simplificado

| Pausar | Paused Until | Situação | Ação da IA |
|--------|--------------|----------|------------|
| `false`| Qualquer     | Ativo    | ✅ RESPONDE |
| `true` | `null`       | Pausa Manual | ❌ NÃO RESPONDE |
| `true` | Futuro       | Pausa Temp. | ❌ NÃO RESPONDE |
| `true` | Passado      | Expirou  | ✅ RESPONDE |

## Limpeza Automática (Opcional)

Para manter o banco limpo, você pode criar um workflow agendado (Cron) no N8N que roda a cada hora:

```sql
UPDATE vox_es_pausar 
SET pausar = false, paused_until = NULL 
WHERE pausar = true 
  AND paused_until IS NOT NULL 
  AND paused_until < NOW();
```
Isso "oficializa" a despausa no painel administrativo.

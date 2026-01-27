# SISTEMA COMPLETO DE REPLICAÇÃO DE WORKFLOWS N8N

## ✅ IMPLEMENTADO (PASSO 1):
- [x] API `/api/admin/n8n/workflows` - Listar, ativar, desativar
- [x] API `/api/admin/n8n/replicate` - Replicação em massa
- [x] Interface básica de workflows
- [x] Busca e filtros

## 🚀 PRÓXIMOS PASSOS (PASSO 2):

### 1. CORRIGIR ERRO DE DUPLICAÇÃO
**Problema:** Erro 500 ao duplicar
**Solução:** Verificar exatamente quais campos o n8n aceita

### 2. INTERFACE DE REPLICAÇÃO EM MASSA
**Componentes necessários:**
- [ ] Checkbox em cada workflow card
- [ ] Barra de ações flutuante quando workflows selecionados
- [ ] Modal de seleção de unidades destino
- [ ] Progress bar durante replicação
- [ ] Toast de sucesso/erro detalhado

### 3. FILTROS AVANÇADOS
- [ ] Filtrar por categoria (ZAPI, NOTIFICAÇÕES, LEMBRETE, FOLLOW UP)
- [ ] Mostrar apenas workflows ativos
- [ ] Seleção rápida: "Selecionar todos ativos"

### 4. SISTEMA DE CATEGORIZAÇÃO
**Workflows por categoria:**
- **ZAPI:** Workflows de integração com WhatsApp
- **NOTIFICAÇÕES:** Workflows de notificações automáticas
- **LEMBRETE:** Workflows de lembretes
- **FOLLOW UP:** Workflows de follow-up automático

**Como identificar:**
- Por tag no n8n
- Por nome do workflow
- Por conteúdo dos nós

### 5. INTERFACE FINAL
```
┌─────────────────────────────────────────────────┐
│ 🔄 Workflows n8n - Sistema de Replicação        │
├─────────────────────────────────────────────────┤
│ 🔍 Busca: [_______] Categoria: [Todos ▼]       │
│ Status: [Todos] [Ativos] [Inativos]            │
│                                                  │
│ ☑️ Selecionar: [Todos] [Nenhum] [Ativos]       │
├─────────────────────────────────────────────────┤
│ ZAPI (3 workflows)                              │
│ ┌──────────────────────────────────────────┐   │
│ │ ☑️ ✅ ZAPI - Envio Mensagens             │   │
│ │    [Duplicar] [Exportar] [Desativar]     │   │
│ └──────────────────────────────────────────┘   │
│                                                  │
│ NOTIFICAÇÕES (2 workflows)                      │
│ ┌──────────────────────────────────────────┐   │
│ │ ☑️ ✅ Notificação - Lead Novo            │   │
│ │    [Duplicar] [Exportar] [Desativar]     │   │
│ └──────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│ 5 selecionados | [❌ Cancelar] [🔄 Replicar]   │
└─────────────────────────────────────────────────┘

MODAL DE REPLICAÇÃO:
┌─────────────────────────────────────────────────┐
│ 🔄 Replicar 5 workflows para unidades          │
├─────────────────────────────────────────────────┤
│ Selecione as unidades destino:                  │
│ ☑️ Vox BH                                       │
│ ☑️ Vox SP                                       │
│ ☑️ Vox ES                                       │
│ ☐ Vox Rio                                       │
│                                                  │
│ ⚙️ Configurações:                               │
│ ☑️ Substituir variáveis automaticamente         │
│ ☑️ Adicionar tag da unidade                     │
│ ☐ Ativar workflows após replicação             │
│                                                  │
│ [Cancelar] [Iniciar Replicação →]              │
└─────────────────────────────────────────────────┘
```

## 🎯 OBJETIVO FINAL:
Sistema completo onde o admin pode:
1. Ver todos os workflows categorizados
2. Selecionar múltiplos workflows (especialmente ZAPI, NOTIFICAÇÕES, LEMBRETE, FOLLOW UP)
3. Escolher unidades destino (Vox SP, Vox ES, Vox Rio)
4. Replicar em massa com substituição automática de variáveis
5. Ver progresso e resultados

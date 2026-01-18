# CRM com Funil Personalizável

## Funcionalidades Implementadas

### 1. Status de Leads
O sistema agora suporta os seguintes status:
- **Entrada de Leads**: Novos leads que acabaram de entrar
- **Em Atendimento**: Leads em conversa ativa
- **Qualificação**: Leads sendo qualificados
- **Em Negociação**: Leads em processo de negociação (novo)
- **Ganhos**: Leads convertidos/ganhos (novo)
- **Perdido**: Leads que não avançaram (novo)
- **Sem Resposta**: Leads sem resposta há mais de 24h
- **Fazer Follow-up**: Leads que precisam de follow-up
- **Agendado**: Leads com agendamento confirmado

### 2. Funil Personalizável
- **Criar colunas customizadas**: Adicione quantas colunas quiser ao seu funil
- **Personalizar cores**: Escolha a cor de cada coluna
- **Renomear colunas**: Edite o nome de qualquer coluna
- **Reordenar colunas**: As colunas são ordenadas automaticamente
- **Remover colunas customizadas**: Remova colunas que você criou (colunas padrão não podem ser removidas)

### 3. Persistência de Status
- Quando você arrasta um lead de uma coluna para outra, o status é salvo automaticamente
- O status personalizado tem prioridade sobre a classificação automática
- Os status são salvos no banco de dados

## Como Usar

### Personalizar o Funil

1. Clique no botão **"Personalizar Funil"** no topo do kanban
2. No modal que abrir:
   - **Editar colunas existentes**: Clique no campo de texto e digite o novo nome
   - **Alterar cor**: Clique no seletor de cor ao lado de cada coluna
   - **Adicionar nova coluna**: Digite o nome da nova coluna, escolha uma cor e clique em "Adicionar"
   - **Remover coluna**: Clique no botão X ao lado de colunas customizadas
3. Clique em **"Salvar Funil"** para aplicar as mudanças

### Mover Leads entre Colunas

1. Arraste e solte um card de lead de uma coluna para outra
2. O status será atualizado automaticamente
3. Uma notificação confirmará que o status foi salvo

## Estrutura do Banco de Dados

### Tabelas Criadas

1. **robson_vox_crm_funnel_config**
   - Armazena a configuração do funil personalizado
   - Campos: `id`, `columns` (JSONB), `created_at`, `updated_at`

2. **robson_vox_crm_lead_status**
   - Armazena o status personalizado de cada lead
   - Campos: `id`, `lead_id`, `status`, `created_at`, `updated_at`

## Migração do Banco de Dados

Execute o arquivo SQL em `supabase/migrations/crm_funnel_tables.sql` para criar as tabelas necessárias.

## APIs Criadas

### GET /api/crm/funnel
Busca a configuração do funil personalizado

### POST /api/crm/funnel
Salva a configuração do funil personalizado
Body: `{ columns: Array<{id, title, order, color}> }`

### GET /api/crm/status?leadId=xxx
Busca o status de um lead específico

### PUT /api/crm/status
Atualiza o status de um lead
Body: `{ leadId: string, status: string }`


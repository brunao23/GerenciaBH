/**
 * Templates de Workflows N8N
 * 
 * Este arquivo importa e exporta todos os templates de workflows
 * que podem ser replicados para novas empresas.
 */

import { WorkflowTemplate } from '@/types/n8n';
import fs from 'fs';
import path from 'path';

// Caminho base dos templates
const TEMPLATES_DIR = path.join(process.cwd(), 'workflows', 'templates');

/**
 * Carrega um template JSON do disco
 */
function loadTemplate(filename: string): any {
    const filepath = path.join(TEMPLATES_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
}

/**
 * 1. ZAPI PRINCIPAL
 */
export const zapiPrincipalTemplate: WorkflowTemplate = {
    id: 'zapi-principal',
    name: 'ZAPI PRINCIPAL',
    description: 'Webhook principal com AI Agent, Redis, Postgres e Tools para agendamento',
    category: 'core',
    variables: [
        'EMPRESA_NOME', 'SCHEMA', 'TABLE_FOLLOW_NORMAL', 'TABLE_AGENDAMENTOS',
        'TABLE_PAUSAR', 'SUPABASE_API_ID', 'SUPABASE_API_NAME', 'REDIS_ID',
        'REDIS_NAME', 'WORKFLOW_BUSCAR_HORARIOS', 'WORKFLOW_CRIAR_AGENDAMENTO',
        'WORKFLOW_NOTIFICACAO_ATENDENTE'
    ],
    template: loadTemplate('zapi-principal.json')
};

/**
 * 2. FOLLOW-UP
 */
export const followUpTemplate: WorkflowTemplate = {
    id: 'follow-up',
    name: 'FOLLOW-UP',
    description: 'Sistema de follow-up automático com 5 etapas (30m, 1h, 24h, 36h, 5d)',
    category: 'followup',
    variables: [
        'EMPRESA_NOME', 'SCHEMA', 'TABLE_FOLLOW_NORMAL', 'TABLE_CHAT_HISTORIES',
        'SUPABASE_API_ID', 'SUPABASE_API_NAME', 'POSTGRES_ID', 'POSTGRES_NAME'
    ],
    template: loadTemplate('follow-up.json')
};

/**
 * 3. BUSCAR HORÁRIOS
 */
export const buscarHorariosTemplate: WorkflowTemplate = {
    id: 'buscar-horarios',
    name: 'BUSCAR HORÁRIOS',
    description: 'Busca horários disponíveis no Google Calendar',
    category: 'scheduling',
    variables: [
        'EMPRESA_NOME', 'GOOGLE_CALENDAR_ID', 'GOOGLE_CALENDAR_NAME', 'CALENDAR_EMAIL'
    ],
    template: loadTemplate('buscar-horarios.json')
};

/**
 * 4. CRIAR AGENDAMENTO
 */
export const criarAgendamentoTemplate: WorkflowTemplate = {
    id: 'criar-agendamento',
    name: 'CRIAR AGENDAMENTO',
    description: 'Cria agendamento no Google Calendar com validações completas',
    category: 'scheduling',
    variables: [
        'EMPRESA_NOME', 'SCHEMA', 'TABLE_AGENDAMENTOS', 'TABLE_FOLLOW_NORMAL',
        'GOOGLE_CALENDAR_ID', 'GOOGLE_CALENDAR_NAME', 'CALENDAR_EMAIL',
        'REDIS_ID', 'REDIS_NAME', 'SUPABASE_API_ID', 'SUPABASE_API_NAME',
        'WORKFLOW_NOTIFICACAO_AGENDAMENTO'
    ],
    template: loadTemplate('criar-agendamento.json')
};

/**
 * 5. LEMBRETE
 */
export const lembreteTemplate: WorkflowTemplate = {
    id: 'lembrete',
    name: 'LEMBRETE',
    description: 'Sistema de lembretes automáticos (72h, 48h, 1h antes)',
    category: 'scheduling',
    variables: [
        'EMPRESA_NOME', 'SCHEMA', 'TABLE_AGENDAMENTOS', 'TABLE_CHAT_HISTORIES',
        'SUPABASE_API_ID', 'SUPABASE_API_NAME', 'POSTGRES_ID', 'POSTGRES_NAME'
    ],
    template: loadTemplate('lembrete.json')
};

/**
 * 6. NOTIFICAÇÃO DE AGENDAMENTO
 */
export const notificacaoAgendamentoTemplate: WorkflowTemplate = {
    id: 'notificacao-agendamento',
    name: 'NOTIFICAÇÃO DE AGENDAMENTO',
    description: 'Notifica grupo quando agendamento é confirmado',
    category: 'notification',
    variables: [
        'EMPRESA_NOME', 'TABLE_PAUSAR', 'EVOLUTION_INSTANCE', 'NOTIFICATION_GROUP',
        'SUPABASE_API_ID', 'SUPABASE_API_NAME'
    ],
    template: loadTemplate('notificacao-agendamento.json')
};

/**
 * 7. NOTIFICAÇÃO DE ATENDENTE
 */
export const notificacaoAtendenteTemplate: WorkflowTemplate = {
    id: 'notificacao-atendente',
    name: 'NOTIFICAÇÃO DE ATENDENTE',
    description: 'Notifica quando lead precisa de ajuda humana',
    category: 'notification',
    variables: [
        'EMPRESA_NOME', 'TABLE_PAUSAR', 'TABLE_FOLLOW_NORMAL', 'EVOLUTION_INSTANCE',
        'NOTIFICATION_GROUP', 'SUPABASE_API_ID', 'SUPABASE_API_NAME'
    ],
    template: loadTemplate('notificacao-atendente.json')
};

/**
 * Array com TODOS os 7 templates
 */
export const workflowTemplates: WorkflowTemplate[] = [
    zapiPrincipalTemplate,
    followUpTemplate,
    buscarHorariosTemplate,
    criarAgendamentoTemplate,
    lembreteTemplate,
    notificacaoAgendamentoTemplate,
    notificacaoAtendenteTemplate,
];

/**
 * Buscar template por ID
 */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
    return workflowTemplates.find(t => t.id === id);
}

/**
 * Buscar templates por categoria
 */
export function getTemplatesByCategory(category: 'core' | 'notification' | 'scheduling' | 'followup'): WorkflowTemplate[] {
    return workflowTemplates.filter(t => t.category === category);
}

/**
 * Listar todos os templates
 */
export function listAllTemplates(): Array<{ id: string; name: string; description: string; category: string }> {
    return workflowTemplates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
    }));
}

/**
 * Obter contagem por categoria
 */
export function getTemplateStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};

    for (const t of workflowTemplates) {
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }

    return {
        total: workflowTemplates.length,
        byCategory,
    };
}

/**
 * Template Engine - Substitui variáveis nos templates de workflows
 */

import { ReplicationConfig } from '@/types/n8n';

export class WorkflowTemplateEngine {
    /**
     * Substitui variáveis no template do workflow
     */
    static replaceVariables(template: any, config: ReplicationConfig): any {
        const templateStr = JSON.stringify(template);

        // Mapa de substituições
        const replacements: Record<string, string> = {
            // Informações da empresa
            '{{EMPRESA_ID}}': config.empresaId,
            '{{EMPRESA_NOME}}': config.empresaNome,
            '{{SCHEMA}}': config.schema,

            // Tabelas do banco de dados
            '{{TABLE_AGENDAMENTOS}}': `${config.schema}_agendamentos`,
            '{{TABLE_FOLLOW_NORMAL}}': `${config.schema}_follow_normal`,
            '{{TABLE_FOLLOWUP}}': `${config.schema}_followup`,
            '{{TABLE_PAUSAR}}': `${config.schema}_pausar`,
            '{{TABLE_CHAT_HISTORIES}}': `${config.schema}n8n_chat_histories`,
            '{{TABLE_LEMBRETES_IA}}': `lembretes_ia`,

            // Credenciais Supabase
            '{{SUPABASE_API_ID}}': config.credentials.supabaseApiId,
            '{{SUPABASE_API_NAME}}': config.credentials.supabaseApiName,

            // Credenciais Redis
            '{{REDIS_ID}}': config.credentials.redisId,
            '{{REDIS_NAME}}': config.credentials.redisName,

            // Credenciais PostgreSQL
            '{{POSTGRES_ID}}': config.credentials.postgresId,
            '{{POSTGRES_NAME}}': config.credentials.postgresName,

            // Credenciais Google Calendar (se aplicável)
            '{{GOOGLE_CALENDAR_ID}}': config.credentials.googleCalendarId || '',
            '{{GOOGLE_CALENDAR_NAME}}': config.credentials.googleCalendarName || '',
            '{{CALENDAR_EMAIL}}': config.calendarEmail || '',

            // Credenciais Evolution API (se aplicável)
            '{{EVOLUTION_API_ID}}': config.credentials.evolutionApiId || '',
            '{{EVOLUTION_API_NAME}}': config.credentials.evolutionApiName || '',
            '{{EVOLUTION_INSTANCE}}': config.evolutionInstance || '',

            // Webhook e notificações
            '{{WEBHOOK_BASE_URL}}': config.webhookBaseUrl || process.env.N8N_WEBHOOK_URL || 'https://webhook.iagoflow.com',
            '{{NOTIFICATION_GROUP}}': config.notificationGroup || '',
        };

        // Substitui todas as variáveis
        let result = templateStr;
        for (const [key, value] of Object.entries(replacements)) {
            const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            result = result.replace(regex, value);
        }

        return JSON.parse(result);
    }

    /**
     * Valida se todas as variáveis obrigatórias foram substituídas
     */
    static validateTemplate(template: any): { valid: boolean; missingVars: string[] } {
        const templateStr = JSON.stringify(template);
        const variablePattern = /\{\{([A-Z_]+)\}\}/g;
        const missingVars: string[] = [];

        let match;
        while ((match = variablePattern.exec(templateStr)) !== null) {
            if (!missingVars.includes(match[1])) {
                missingVars.push(match[1]);
            }
        }

        return {
            valid: missingVars.length === 0,
            missingVars,
        };
    }

    /**
     * Extrai todas as variáveis de um template
     */
    static extractVariables(template: any): string[] {
        const templateStr = JSON.stringify(template);
        const variablePattern = /\{\{([A-Z_]+)\}\}/g;
        const variables: string[] = [];

        let match;
        while ((match = variablePattern.exec(templateStr)) !== null) {
            if (!variables.includes(match[1])) {
                variables.push(match[1]);
            }
        }

        return variables;
    }

    /**
     * Atualiza o nome do workflow com prefixo da empresa
     */
    static updateWorkflowName(workflowName: string, empresaNome: string): string {
        return `[${empresaNome.toUpperCase()}] ${workflowName}`;
    }

    /**
     * Gera ID único para sessão Redis
     */
    static generateRedisSessionId(numeroCliente: string, suffix: string, schema: string): string {
        return `${schema}:${numeroCliente}:${suffix}`;
    }
}

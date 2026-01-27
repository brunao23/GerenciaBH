/**
 * Tipos para integração com N8N
 */

export interface N8nCredentials {
    supabaseApiId: string;
    supabaseApiName: string;
    redisId: string;
    redisName: string;
    postgresId: string;
    postgresName: string;
    googleCalendarId?: string;
    googleCalendarName?: string;
    evolutionApiId?: string;
    evolutionApiName?: string;
}

export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: 'core' | 'notification' | 'scheduling' | 'followup';
    variables: string[]; // Lista de variáveis que serão substituídas
    template: any; // JSON do workflow
}

export interface ReplicationConfig {
    empresaId: string;
    empresaNome: string;
    schema: string;
    credentials: N8nCredentials;
    webhookBaseUrl?: string;
    calendarEmail?: string;
    evolutionInstance?: string;
    notificationGroup?: string;
}

export interface WorkflowReplicationResult {
    workflowId: string;
    workflowName: string;
    success: boolean;
    n8nWorkflowId?: string;
    error?: string;
}

export interface N8nWorkflow {
    id?: string;
    name: string;
    active: boolean;
    nodes: any[];
    connections: any;
    settings?: any;
    staticData?: any;
}

export interface N8nApiResponse {
    success: boolean;
    data?: any;
    error?: string;
}

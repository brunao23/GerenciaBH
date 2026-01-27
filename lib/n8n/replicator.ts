/**
 * Workflow Replicator - Sistema de replicação de workflows
 */

import { N8nClient } from './client';
import { WorkflowTemplateEngine } from './template-engine';
import {
    ReplicationConfig,
    WorkflowReplicationResult,
    WorkflowTemplate
} from '@/types/n8n';
import { workflowTemplates } from './templates';

export class WorkflowReplicator {
    private n8nClient: N8nClient;

    constructor(n8nClient?: N8nClient) {
        this.n8nClient = n8nClient || new N8nClient();
    }

    /**
     * Replica todos os workflows para uma nova empresa
     */
    async replicateAll(config: ReplicationConfig): Promise<{
        success: boolean;
        results: WorkflowReplicationResult[];
        errors: string[];
    }> {
        console.log(`🚀 Iniciando replicação de workflows para: ${config.empresaNome}`);

        const results: WorkflowReplicationResult[] = [];
        const errors: string[] = [];

        // Validar configuração
        const configValidation = this.validateConfig(config);
        if (!configValidation.valid) {
            return {
                success: false,
                results: [],
                errors: configValidation.errors,
            };
        }

        // Replicar cada workflow
        for (const template of workflowTemplates) {
            try {
                console.log(`  📋 Replicando: ${template.name}`);
                const result = await this.replicateWorkflow(template, config);
                results.push(result);

                if (!result.success) {
                    errors.push(`${template.name}: ${result.error}`);
                }
            } catch (error: any) {
                const errorMsg = `${template.name}: ${error.message}`;
                errors.push(errorMsg);
                results.push({
                    workflowId: template.id,
                    workflowName: template.name,
                    success: false,
                    error: error.message,
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        console.log(`✅ Replicação concluída: ${successCount}/${totalCount} workflows criados`);

        return {
            success: successCount === totalCount,
            results,
            errors,
        };
    }

    /**
     * Replica um workflow específico
     */
    async replicateWorkflow(
        template: WorkflowTemplate,
        config: ReplicationConfig
    ): Promise<WorkflowReplicationResult> {
        try {
            // 1. Substituir variáveis no template
            const workflowData = WorkflowTemplateEngine.replaceVariables(
                template.template,
                config
            );

            // 2. Validar template
            const validation = WorkflowTemplateEngine.validateTemplate(workflowData);
            if (!validation.valid) {
                throw new Error(
                    `Variáveis não substituídas: ${validation.missingVars.join(', ')}`
                );
            }

            // 3. Atualizar nome do workflow
            workflowData.name = WorkflowTemplateEngine.updateWorkflowName(
                template.name,
                config.empresaNome
            );

            // 3.5 VERIFICAÇÃO: Checar se já existe um workflow com este nome
            // Isso evita duplicação se rodar mais de uma vez ou se o cliente já criou manualmente
            try {
                console.log(`    🔍 Verificando se workflow já existe: "${workflowData.name}"...`);
                const existingList = await this.n8nClient.listWorkflows();

                if (existingList.success && existingList.data && Array.isArray(existingList.data.data)) {
                    const existing = existingList.data.data.find(
                        (w: any) => w.name === workflowData.name
                    );

                    if (existing) {
                        console.log(`    ⚠️ Workflow já existe (ID: ${existing.id}). Pulando criação.`);
                        return {
                            workflowId: template.id,
                            workflowName: template.name,
                            success: true,
                            n8nWorkflowId: existing.id,
                        };
                    }
                }
            } catch (checkErr) {
                console.warn('    ⚠️ Falha ao verificar existência (tentando criar mesmo assim):', checkErr);
            }

            // 4. Criar workflow no N8N
            const response = await this.n8nClient.createWorkflow(workflowData);

            if (!response.success) {
                throw new Error(response.error || 'Erro desconhecido ao criar workflow');
            }

            console.log(`    ✅ ${template.name} criado com sucesso (ID: ${response.data?.id})`);

            return {
                workflowId: template.id,
                workflowName: template.name,
                success: true,
                n8nWorkflowId: response.data?.id,
            };
        } catch (error: any) {
            console.error(`    ❌ Erro ao replicar ${template.name}:`, error.message);
            return {
                workflowId: template.id,
                workflowName: template.name,
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Valida a configuração de replicação
     */
    private validateConfig(config: ReplicationConfig): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Validações obrigatórias
        if (!config.empresaId) errors.push('empresaId é obrigatório');
        if (!config.empresaNome) errors.push('empresaNome é obrigatório');
        if (!config.schema) errors.push('schema é obrigatório');

        // Validar credenciais
        if (!config.credentials.supabaseApiId) errors.push('Supabase API ID é obrigatório');
        if (!config.credentials.supabaseApiName) errors.push('Supabase API Name é obrigatório');
        if (!config.credentials.redisId) errors.push('Redis ID é obrigatório');
        if (!config.credentials.redisName) errors.push('Redis Name é obrigatório');
        if (!config.credentials.postgresId) errors.push('Postgres ID é obrigatório');
        if (!config.credentials.postgresName) errors.push('Postgres Name é obrigatório');

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Remove todos os workflows de uma empresa
     */
    async removeAllWorkflows(empresaNome: string): Promise<{
        success: boolean;
        deleted: number;
        errors: string[];
    }> {
        console.log(`🗑️  Removendo workflows de: ${empresaNome}`);

        const errors: string[] = [];
        let deleted = 0;

        try {
            // Listar todos os workflows
            const response = await this.n8nClient.listWorkflows();

            if (!response.success || !response.data) {
                throw new Error('Não foi possível listar workflows');
            }

            const workflows = response.data.data || response.data;
            const prefix = `[${empresaNome.toUpperCase()}]`;

            // Filtrar e deletar workflows da empresa
            for (const workflow of workflows) {
                if (workflow.name && workflow.name.startsWith(prefix)) {
                    const deleteResponse = await this.n8nClient.deleteWorkflow(workflow.id);

                    if (deleteResponse.success) {
                        deleted++;
                        console.log(`  ✅ Deletado: ${workflow.name}`);
                    } else {
                        errors.push(`Erro ao deletar ${workflow.name}: ${deleteResponse.error}`);
                    }
                }
            }

            console.log(`✅ Remoção concluída: ${deleted} workflows deletados`);

            return {
                success: errors.length === 0,
                deleted,
                errors,
            };
        } catch (error: any) {
            console.error('❌ Erro ao remover workflows:', error);
            return {
                success: false,
                deleted,
                errors: [error.message],
            };
        }
    }
}

// Singleton instance
export const workflowReplicator = new WorkflowReplicator();

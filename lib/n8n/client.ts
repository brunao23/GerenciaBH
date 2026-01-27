/**
 * Cliente N8N - Biblioteca de integração com N8N API
 */

import { N8nWorkflow, N8nApiResponse } from '@/types/n8n';

export class N8nClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl?: string, apiKey?: string) {
        this.baseUrl = baseUrl || process.env.N8N_API_URL || 'https://webhook.iagoflow.com';
        this.apiKey = apiKey || process.env.N8N_API_KEY || '';
    }

    /**
     * Headers padrão para chamadas à API
     */
    private getHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': this.apiKey,
        };
    }

    /**
     * Criar um novo workflow
     */
    async createWorkflow(workflow: N8nWorkflow): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(workflow),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`N8N API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error: any) {
            console.error('Erro ao criar workflow:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Listar todos os workflows
     */
    async listWorkflows(): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
                method: 'GET',
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error: any) {
            console.error('Erro ao listar workflows:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obter um workflow específico
     */
    async getWorkflow(workflowId: string): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
                method: 'GET',
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error: any) {
            console.error('Erro ao obter workflow:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Atualizar um workflow
     */
    async updateWorkflow(workflowId: string, workflow: Partial<N8nWorkflow>): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(workflow),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error: any) {
            console.error('Erro ao atualizar workflow:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Deletar um workflow
     */
    async deleteWorkflow(workflowId: string): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
                method: 'DELETE',
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            return { success: true };
        } catch (error: any) {
            console.error('Erro ao deletar workflow:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Ativar/Desativar um workflow
     */
    async toggleWorkflow(workflowId: string, active: boolean): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/${active ? 'activate' : 'deactivate'}`, {
                method: 'POST',
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error: any) {
            console.error('Erro ao toggle workflow:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Executar um workflow manualmente
     */
    async executeWorkflow(workflowId: string, data?: any): Promise<N8nApiResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/execute`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ data }),
            });

            if (!response.ok) {
                throw new Error(`N8N API Error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result };
        } catch (error: any) {
            console.error('Erro ao executar workflow:', error);
            return { success: false, error: error.message };
        }
    }
}

// Singleton instance
export const n8nClient = new N8nClient();

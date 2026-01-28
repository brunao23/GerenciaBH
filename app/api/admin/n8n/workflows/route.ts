import { NextRequest, NextResponse } from 'next/server';
import { N8nClient } from '@/lib/n8n/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/n8n/workflows
 * Lista todos os workflows do N8N para seleção manual
 */
export async function GET(req: NextRequest) {
    try {
        const n8nClient = new N8nClient();
        const response = await n8nClient.listWorkflows();

        if (!response.success || !response.data) {
            return NextResponse.json({
                error: 'Falha ao listar workflows do N8N',
                details: response.error
            }, { status: 500 });
        }

        const workflows = response.data.data || response.data;

        // Mapear apenas dados essenciais
        const simplifiedWorkflows = workflows.map((w: any) => ({
            id: w.id,
            name: w.name,
            active: w.active,
            updatedAt: w.updatedAt
        }));

        return NextResponse.json({
            workflows: simplifiedWorkflows
        });

    } catch (error: any) {
        console.error('[Admin API] Erro ao listar workflows:', error);
        return NextResponse.json({
            error: 'Erro inexperado ao listar workflows',
            details: error.message
        }, { status: 500 });
    }
}

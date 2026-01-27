/**
 * API: Listar Workflows
 * GET /api/admin/workflows/list
 * 
 * Lista todos os workflows do N8N com informações
 */

import { NextRequest, NextResponse } from 'next/server';
import { n8nClient } from '@/lib/n8n';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    try {
        // 1. Autenticação
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401 }
            );
        }

        // 2. Verificar se é admin
        const { data: profile } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json(
                { error: 'Acesso negado' },
                { status: 403 }
            );
        }

        // 3. Obter filtro de empresa (opcional)
        const { searchParams } = new URL(req.url);
        const empresaId = searchParams.get('empresaId');
        let empresaNome: string | null = null;

        if (empresaId) {
            const { data: empresa } = await supabase
                .from('empresas')
                .select('nome')
                .eq('id', empresaId)
                .single();

            if (empresa) {
                empresaNome = empresa.nome;
            }
        }

        // 4. Listar workflows do N8N
        const response = await n8nClient.listWorkflows();

        if (!response.success) {
            return NextResponse.json(
                { error: 'Erro ao listar workflows', details: response.error },
                { status: 500 }
            );
        }

        const workflows = response.data?.data || response.data || [];

        // 5. Filtrar por empresa se necessário
        let filteredWorkflows = workflows;

        if (empresaNome) {
            const prefix = `[${empresaNome.toUpperCase()}]`;
            filteredWorkflows = workflows.filter((w: any) =>
                w.name && w.name.startsWith(prefix)
            );
        }

        // 6. Agrupar por empresa
        const workflowsByEmpresa: Record<string, any[]> = {};

        for (const workflow of filteredWorkflows) {
            // Extrair nome da empresa do prefixo [EMPRESA]
            const match = workflow.name?.match(/^\[([^\]]+)\]/);
            const empresa = match ? match[1] : 'Sem Empresa';

            if (!workflowsByEmpresa[empresa]) {
                workflowsByEmpresa[empresa] = [];
            }

            workflowsByEmpresa[empresa].push({
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
            });
        }

        // 7. Retornar resultado
        return NextResponse.json({
            success: true,
            total: filteredWorkflows.length,
            workflows: filteredWorkflows.map((w: any) => ({
                id: w.id,
                name: w.name,
                active: w.active,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
            })),
            byEmpresa: workflowsByEmpresa,
        });

    } catch (error: any) {
        console.error('❌ Erro ao listar workflows:', error);
        return NextResponse.json(
            {
                error: 'Erro ao listar workflows',
                details: error.message
            },
            { status: 500 }
        );
    }
}

/**
 * API: Replicar Workflows para uma Empresa
 * POST /api/admin/empresas/[id]/workflows
 * 
 * Replica os 7 workflows N8N para a empresa
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Verificar autenticação
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // Buscar empresa e credenciais
        const { data: empresa, error: empError } = await supabaseAdmin
            .from('empresas')
            .select(`
        id,
        nome,
        schema,
        empresa_credenciais (*)
      `)
            .eq('id', id)
            .single();

        if (empError || !empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        const credenciais = empresa.empresa_credenciais?.[0];

        if (!credenciais) {
            return NextResponse.json({
                error: 'Credenciais N8N não configuradas para esta empresa',
                instrucao: 'Configure as credenciais primeiro em PUT /api/admin/empresas/' + id,
            }, { status: 400 });
        }

        // Verificar credenciais mínimas
        if (!credenciais.supabase_api_id) {
            return NextResponse.json({
                error: 'Credencial Supabase API não configurada',
            }, { status: 400 });
        }

        console.log(`🔄 Replicando workflows para: ${empresa.nome} (${empresa.schema})`);

        // Importar replicador e templates
        const { WorkflowReplicator } = await import('@/lib/n8n/replicator');
        const { workflowTemplates } = await import('@/lib/n8n/templates');

        const replicator = new WorkflowReplicator();

        // Montar configuração
        const config = {
            empresaId: empresa.id,
            empresaNome: empresa.nome,
            schema: empresa.schema,
            credentials: {
                supabaseApiId: credenciais.supabase_api_id || '',
                supabaseApiName: credenciais.supabase_api_name || '',
                redisId: credenciais.redis_id || '',
                redisName: credenciais.redis_name || '',
                postgresId: credenciais.postgres_id || '',
                postgresName: credenciais.postgres_name || '',
                googleCalendarId: credenciais.google_calendar_id || '',
                googleCalendarName: credenciais.google_calendar_name || '',
                calendarEmail: credenciais.calendar_email || '',
                evolutionInstance: credenciais.evolution_instance || '',
                notificationGroup: credenciais.notification_group || '',
            },
            tables: {
                agendamentos: `${empresa.schema}_agendamentos`,
                followNormal: `${empresa.schema}_follow_normal`,
                followup: `${empresa.schema}_followup`,
                pausar: `${empresa.schema}_pausar`,
                chatHistories: `${empresa.schema}n8n_chat_histories`,
                notifications: `${empresa.schema}_notifications`,
                crmLeadStatus: `${empresa.schema}_crm_lead_status`,
            },
        };

        // Replicar workflows
        const resultado = await replicator.replicateAll(config, workflowTemplates);

        // Salvar IDs dos workflows criados nas credenciais
        if (resultado.success && resultado.results) {
            const workflowIds: Record<string, string> = {};

            for (const r of resultado.results) {
                if (r.success && r.n8nWorkflowId) {
                    const key = `workflow_${r.templateId.replace(/-/g, '_')}`;
                    workflowIds[key] = r.n8nWorkflowId;

                    // Salvar no mapeamento
                    await supabaseAdmin
                        .from('empresa_workflows')
                        .upsert({
                            empresa_id: empresa.id,
                            workflow_id: r.n8nWorkflowId,
                            workflow_name: r.workflowName,
                            workflow_type: r.templateId,
                            active: true,
                        });
                }
            }

            // Atualizar credenciais com IDs dos workflows
            await supabaseAdmin
                .from('empresa_credenciais')
                .update(workflowIds)
                .eq('empresa_id', empresa.id);
        }

        // Registrar no log
        await supabaseAdmin
            .from('workflow_replications')
            .insert({
                empresa_id: empresa.id,
                success: resultado.success,
                workflows_created: resultado.results?.filter(r => r.success).length || 0,
                workflows_failed: resultado.results?.filter(r => !r.success).length || 0,
                results: resultado.results,
                errors: resultado.results?.filter(r => !r.success).map(r => r.error) || null,
            });

        return NextResponse.json({
            success: resultado.success,
            message: resultado.success
                ? `${resultado.results?.filter(r => r.success).length || 0} workflows replicados com sucesso!`
                : 'Alguns workflows falharam',
            workflows: resultado.results?.map(r => ({
                template: r.templateId,
                nome: r.workflowName,
                sucesso: r.success,
                id_n8n: r.n8nWorkflowId,
                erro: r.error,
            })),
        });

    } catch (error: any) {
        console.error('❌ Erro ao replicar workflows:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET: Listar workflows da empresa
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const { data: workflows, error } = await supabaseAdmin
            .from('empresa_workflows')
            .select('*')
            .eq('empresa_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            total: workflows?.length || 0,
            workflows,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE: Remover todos os workflows da empresa
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Buscar workflows
        const { data: workflows } = await supabaseAdmin
            .from('empresa_workflows')
            .select('workflow_id, workflow_name')
            .eq('empresa_id', id);

        if (!workflows || workflows.length === 0) {
            return NextResponse.json({ message: 'Nenhum workflow para remover' });
        }

        // Remover do N8N
        const { N8nClient } = await import('@/lib/n8n/client');
        const n8nClient = new N8nClient();

        const resultados = [];
        for (const wf of workflows) {
            try {
                await n8nClient.deleteWorkflow(wf.workflow_id);
                resultados.push({ id: wf.workflow_id, nome: wf.workflow_name, sucesso: true });
            } catch (err: any) {
                resultados.push({ id: wf.workflow_id, nome: wf.workflow_name, sucesso: false, erro: err.message });
            }
        }

        // Remover do banco
        await supabaseAdmin
            .from('empresa_workflows')
            .delete()
            .eq('empresa_id', id);

        // Limpar IDs das credenciais
        await supabaseAdmin
            .from('empresa_credenciais')
            .update({
                workflow_zapi_principal: null,
                workflow_follow_up: null,
                workflow_buscar_horarios: null,
                workflow_criar_agendamento: null,
                workflow_lembrete: null,
                workflow_notificacao_agendamento: null,
                workflow_notificacao_atendente: null,
            })
            .eq('empresa_id', id);

        return NextResponse.json({
            success: true,
            removidos: resultados.filter(r => r.sucesso).length,
            total: workflows.length,
            detalhes: resultados,
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * API: Criar Nova Empresa (Onboarding Completo e OBRIGATÓRIO)
 * POST /api/admin/empresas/criar
 * 
 * Este endpoint faz TUDO automaticamente e OBRIGATORIAMENTE:
 * 1. Cria o registro da empresa
 * 2. Gera o schema (nome normalizado)
 * 3. Cria as 12 tabelas no banco
 * 4. OBRIGATÓRIO: Replica os 7 workflows N8N
 * 5. OBRIGATÓRIO: Salva as credenciais
 * 
 * Se qualquer etapa falhar, a operação é revertida!
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cliente Supabase com service role (admin)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Interface para criação de empresa - CREDENCIAIS SÃO OBRIGATÓRIAS
interface CriarEmpresaRequest {
    nome: string;                    // Ex: "Vox São Paulo" - OBRIGATÓRIO
    schema?: string;                 // Opcional - se não passar, gera automaticamente
    email_admin?: string;            // Email do admin da empresa
    telefone?: string;               // Telefone de contato
    endereco?: string;               // Endereço

    // Credenciais N8N - OBRIGATÓRIAS para criar empresa
    credenciais: {
        supabase_api_id: string;       // OBRIGATÓRIO
        supabase_api_name: string;     // OBRIGATÓRIO
        redis_id: string;              // OBRIGATÓRIO
        redis_name: string;            // OBRIGATÓRIO
        postgres_id: string;           // OBRIGATÓRIO
        postgres_name: string;         // OBRIGATÓRIO
        google_calendar_id: string;    // OBRIGATÓRIO
        google_calendar_name: string;  // OBRIGATÓRIO
        calendar_email: string;        // OBRIGATÓRIO
        notification_group: string;    // OBRIGATÓRIO
        evolution_instance?: string;   // Opcional
        zapi_instance?: string;        // Opcional
        zapi_token?: string;           // Opcional
    };
}

/**
 * Gera um schema válido a partir do nome da empresa
 * Ex: "Vox São Paulo" → "vox_sao_paulo"
 */
function gerarSchema(nome: string): string {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '')     // Remove caracteres especiais
        .trim()
        .replace(/\s+/g, '_')            // Espaços viram underscore
        .replace(/_+/g, '_')             // Remove underscores duplicados
        .substring(0, 30);               // Máximo 30 caracteres
}

/**
 * Verifica se o schema já existe
 */
async function schemaExiste(schema: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('empresas')
        .select('id')
        .eq('schema', schema)
        .single();

    return !!data;
}

/**
 * Cria as 12 tabelas da empresa no banco
 */
async function criarTabelasEmpresa(schema: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabaseAdmin.rpc('criar_tabelas_empresa', {
            p_schema: schema
        });

        if (error) {
            console.error('Erro ao criar tabelas:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err: any) {
        console.error('Exceção ao criar tabelas:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Verifica se as tabelas foram criadas corretamente
 */
async function verificarTabelas(schema: string): Promise<{ success: boolean; tabelas: any[] }> {
    try {
        const { data, error } = await supabaseAdmin.rpc('verificar_tabelas_empresa', {
            p_schema: schema
        });

        if (error) {
            return { success: false, tabelas: [] };
        }

        const todasExistem = data?.every((t: any) => t.existe) ?? false;
        return { success: todasExistem, tabelas: data || [] };
    } catch {
        return { success: false, tabelas: [] };
    }
}

/**
 * Deleta empresa e todas as suas tabelas (rollback)
 */
async function rollbackEmpresa(empresaId: string, schema: string): Promise<void> {
    try {
        // Deletar tabelas
        await supabaseAdmin.rpc('deletar_tabelas_empresa', { p_schema: schema });

        // Deletar empresa
        await supabaseAdmin.from('empresas').delete().eq('id', empresaId);

        console.log(`🔄 Rollback executado para empresa ${empresaId}`);
    } catch (err) {
        console.error('Erro no rollback:', err);
    }
}

/**
 * Valida se todas as credenciais obrigatórias foram fornecidas
 */
function validarCredenciais(credenciais: any): { valido: boolean; camposFaltando: string[] } {
    const camposObrigatorios = [
        'supabase_api_id',
        'supabase_api_name',
        'redis_id',
        'redis_name',
        'postgres_id',
        'postgres_name',
        'google_calendar_id',
        'google_calendar_name',
        'calendar_email',
        'notification_group',
    ];

    const camposFaltando = camposObrigatorios.filter(
        campo => !credenciais?.[campo] || credenciais[campo].trim() === ''
    );

    return {
        valido: camposFaltando.length === 0,
        camposFaltando,
    };
}

export async function POST(req: NextRequest) {
    let empresaCriada: any = null;
    let schemaCriado: string = '';

    try {
        // 1. Verificar autenticação
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
        }

        // 2. Verificar se é admin
        const { data: usuario } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single();

        if (usuario?.role !== 'admin') {
            return NextResponse.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
        }

        // 3. Obter dados da requisição
        const body: CriarEmpresaRequest = await req.json();

        // 4. VALIDAÇÃO OBRIGATÓRIA: Nome
        if (!body.nome || body.nome.trim().length < 2) {
            return NextResponse.json({
                error: 'Nome da empresa é OBRIGATÓRIO (mínimo 2 caracteres)'
            }, { status: 400 });
        }

        // 5. VALIDAÇÃO OBRIGATÓRIA: Credenciais
        if (!body.credenciais) {
            return NextResponse.json({
                error: 'Credenciais N8N são OBRIGATÓRIAS para criar uma empresa',
                campos_obrigatorios: [
                    'supabase_api_id', 'supabase_api_name',
                    'redis_id', 'redis_name',
                    'postgres_id', 'postgres_name',
                    'google_calendar_id', 'google_calendar_name',
                    'calendar_email', 'notification_group'
                ]
            }, { status: 400 });
        }

        const validacaoCredenciais = validarCredenciais(body.credenciais);
        if (!validacaoCredenciais.valido) {
            return NextResponse.json({
                error: 'Credenciais incompletas. Todos os campos são OBRIGATÓRIOS.',
                campos_faltando: validacaoCredenciais.camposFaltando,
            }, { status: 400 });
        }

        // 6. Gerar ou validar schema
        let schema = body.schema?.trim() || gerarSchema(body.nome);

        // Verificar se schema já existe
        if (await schemaExiste(schema)) {
            let contador = 1;
            let novoSchema = `${schema}_${contador}`;
            while (await schemaExiste(novoSchema) && contador < 100) {
                contador++;
                novoSchema = `${schema}_${contador}`;
            }

            if (contador >= 100) {
                return NextResponse.json({
                    error: `Schema "${schema}" já existe e não foi possível gerar alternativa`
                }, { status: 400 });
            }

            schema = novoSchema;
        }

        schemaCriado = schema;
        console.log(`📝 Criando empresa: ${body.nome} (schema: ${schema})`);

        // 7. Criar registro da empresa
        const { data: empresa, error: empresaError } = await supabaseAdmin
            .from('empresas')
            .insert({
                nome: body.nome.trim(),
                schema: schema,
                email: body.email_admin,
                telefone: body.telefone,
                endereco: body.endereco,
                ativo: true,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (empresaError) {
            console.error('Erro ao criar empresa:', empresaError);
            return NextResponse.json({
                error: 'Erro ao criar empresa',
                details: empresaError.message
            }, { status: 500 });
        }

        empresaCriada = empresa;
        console.log(`✅ Empresa criada: ${empresa.id}`);

        // 8. OBRIGATÓRIO: Criar as 12 tabelas
        console.log(`🔧 Criando tabelas para schema: ${schema}`);
        const resultadoTabelas = await criarTabelasEmpresa(schema);

        if (!resultadoTabelas.success) {
            console.error('❌ FALHA ao criar tabelas - fazendo rollback');
            await rollbackEmpresa(empresa.id, schema);
            return NextResponse.json({
                error: 'FALHA ao criar tabelas no banco de dados',
                details: resultadoTabelas.error,
                rollback: true
            }, { status: 500 });
        }

        // 9. Verificar se tabelas foram criadas
        const verificacao = await verificarTabelas(schema);
        if (!verificacao.success) {
            console.error('❌ Tabelas não foram criadas corretamente - fazendo rollback');
            await rollbackEmpresa(empresa.id, schema);
            return NextResponse.json({
                error: 'Tabelas não foram criadas corretamente',
                tabelas: verificacao.tabelas,
                rollback: true
            }, { status: 500 });
        }

        console.log(`✅ 12 tabelas criadas com sucesso`);

        // 10. OBRIGATÓRIO: Salvar credenciais
        const { error: credError } = await supabaseAdmin
            .from('empresa_credenciais')
            .insert({
                empresa_id: empresa.id,
                ...body.credenciais,
                created_at: new Date().toISOString(),
            });

        if (credError) {
            console.error('❌ FALHA ao salvar credenciais - fazendo rollback');
            await rollbackEmpresa(empresa.id, schema);
            return NextResponse.json({
                error: 'FALHA ao salvar credenciais',
                details: credError.message,
                rollback: true
            }, { status: 500 });
        }

        console.log(`✅ Credenciais salvas`);

        // 11. OBRIGATÓRIO: Replicar workflows N8N
        console.log(`🔄 Replicando 7 workflows N8N...`);

        let workflowsResult: any;
        try {
            const { WorkflowReplicator } = await import('@/lib/n8n/replicator');
            const { workflowTemplates } = await import('@/lib/n8n/templates');

            const replicator = new WorkflowReplicator();

            workflowsResult = await replicator.replicateAll({
                empresaId: empresa.id,
                empresaNome: body.nome,
                schema: schema,
                credentials: {
                    supabaseApiId: body.credenciais.supabase_api_id,
                    supabaseApiName: body.credenciais.supabase_api_name,
                    redisId: body.credenciais.redis_id,
                    redisName: body.credenciais.redis_name,
                    postgresId: body.credenciais.postgres_id,
                    postgresName: body.credenciais.postgres_name,
                    googleCalendarId: body.credenciais.google_calendar_id,
                    googleCalendarName: body.credenciais.google_calendar_name,
                    calendarEmail: body.credenciais.calendar_email,
                    evolutionInstance: body.credenciais.evolution_instance || '',
                    notificationGroup: body.credenciais.notification_group,
                },
                tables: {
                    agendamentos: `${schema}_agendamentos`,
                    followNormal: `${schema}_follow_normal`,
                    followup: `${schema}_followup`,
                    pausar: `${schema}_pausar`,
                    chatHistories: `${schema}n8n_chat_histories`,
                    notifications: `${schema}_notifications`,
                    crmLeadStatus: `${schema}_crm_lead_status`,
                },
            }, workflowTemplates);

            if (!workflowsResult.success) {
                console.error('❌ FALHA ao replicar workflows - fazendo rollback');
                await rollbackEmpresa(empresa.id, schema);
                return NextResponse.json({
                    error: 'FALHA ao replicar workflows N8N',
                    details: workflowsResult.results?.filter((r: any) => !r.success),
                    rollback: true
                }, { status: 500 });
            }

            // Salvar IDs dos workflows criados
            const workflowIds: Record<string, string> = {};
            for (const r of workflowsResult.results || []) {
                if (r.success && r.n8nWorkflowId) {
                    const key = `workflow_${r.templateId.replace(/-/g, '_')}`;
                    workflowIds[key] = r.n8nWorkflowId;

                    // Salvar no mapeamento
                    await supabaseAdmin.from('empresa_workflows').insert({
                        empresa_id: empresa.id,
                        workflow_id: r.n8nWorkflowId,
                        workflow_name: r.workflowName,
                        workflow_type: r.templateId,
                        active: true,
                    });
                }
            }

            // Atualizar credenciais com IDs dos workflows
            if (Object.keys(workflowIds).length > 0) {
                await supabaseAdmin
                    .from('empresa_credenciais')
                    .update(workflowIds)
                    .eq('empresa_id', empresa.id);
            }

            console.log(`✅ ${workflowsResult.results?.filter((r: any) => r.success).length || 0} workflows criados`);

        } catch (err: any) {
            console.error('❌ EXCEÇÃO ao replicar workflows - fazendo rollback:', err);
            await rollbackEmpresa(empresa.id, schema);
            return NextResponse.json({
                error: 'EXCEÇÃO ao replicar workflows N8N',
                details: err.message,
                rollback: true
            }, { status: 500 });
        }

        // 12. Registrar no log de replicações
        await supabaseAdmin.from('workflow_replications').insert({
            empresa_id: empresa.id,
            success: true,
            workflows_created: workflowsResult.results?.filter((r: any) => r.success).length || 0,
            workflows_failed: 0,
            results: workflowsResult.results,
            created_by: user.id,
        });

        // 13. SUCESSO TOTAL - Retornar resultado
        console.log(`🎉 EMPRESA CRIADA COM SUCESSO: ${body.nome}`);

        return NextResponse.json({
            success: true,
            message: `Empresa "${body.nome}" criada com SUCESSO TOTAL!`,
            empresa: {
                id: empresa.id,
                nome: empresa.nome,
                schema: schema,
            },
            tabelas: {
                criadas: true,
                total: 12,
                lista: verificacao.tabelas.map((t: any) => t.tabela),
            },
            workflows: {
                criados: true,
                total: workflowsResult.results?.filter((r: any) => r.success).length || 0,
                lista: workflowsResult.results?.map((r: any) => ({
                    template: r.templateId,
                    nome: r.workflowName,
                    id_n8n: r.n8nWorkflowId,
                })),
            },
            status: '✅ SISTEMA PRONTO PARA USO!',
        });

    } catch (error: any) {
        console.error('❌ Erro geral:', error);

        // Se empresa foi criada, fazer rollback
        if (empresaCriada && schemaCriado) {
            await rollbackEmpresa(empresaCriada.id, schemaCriado);
        }

        return NextResponse.json(
            { error: 'Erro interno', details: error.message, rollback: !!empresaCriada },
            { status: 500 }
        );
    }
}

/**
 * GET: Listar todas as empresas
 */
export async function GET(req: NextRequest) {
    try {
        const { data: empresas, error } = await supabaseAdmin
            .from('empresas')
            .select(`
        id,
        nome,
        schema,
        email,
        telefone,
        ativo,
        created_at,
        empresa_credenciais (
          supabase_api_id,
          google_calendar_id,
          workflow_zapi_principal
        )
      `)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Para cada empresa, verificar status
        const empresasComStatus = await Promise.all(
            (empresas || []).map(async (emp) => {
                const verificacao = await verificarTabelas(emp.schema);
                const tabelasOk = verificacao.tabelas.filter((t: any) => t.existe).length;
                const workflowsOk = !!emp.empresa_credenciais?.[0]?.workflow_zapi_principal;

                return {
                    ...emp,
                    status: {
                        tabelas_ok: verificacao.success,
                        tabelas_count: `${tabelasOk}/12`,
                        workflows_ok: workflowsOk,
                        pronto: verificacao.success && workflowsOk,
                    }
                };
            })
        );

        return NextResponse.json({
            total: empresasComStatus.length,
            empresas: empresasComStatus,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

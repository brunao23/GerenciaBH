/**
 * API Admin: Configuração do Agente AI por Empresa
 * 
 * GET /api/admin/empresas/[id]/agente - Obter configuração
 * PUT /api/admin/empresas/[id]/agente - Atualizar configuração
 * POST /api/admin/empresas/[id]/agente - Sincronizar com N8N
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarPromptAgente, validarConfig, AgenteConfig } from '@/lib/agente/prompt-generator';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * Verifica se o usuário é admin
 */
async function verificarAdmin(req: NextRequest): Promise<{ isAdmin: boolean; userId?: string }> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return { isAdmin: false };
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
        return { isAdmin: false };
    }

    const { data: usuario } = await supabaseAdmin
        .from('usuarios')
        .select('role')
        .eq('id', user.id)
        .single();

    return { isAdmin: usuario?.role === 'admin', userId: user.id };
}

/**
 * GET: Obter configuração do agente de uma empresa específica
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { isAdmin } = await verificarAdmin(req);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { id: empresaId } = await params;

        // Buscar empresa
        const { data: empresa } = await supabaseAdmin
            .from('empresas')
            .select('id, nome, email, schema')
            .eq('id', empresaId)
            .single();

        if (!empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        // Buscar configuração
        const { data: config, error } = await supabaseAdmin
            .from('empresa_agente_config')
            .select('*')
            .eq('empresa_id', empresaId)
            .single();

        if (error && error.code !== 'PGRST116') {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            empresa,
            config: config || null,
            defaults: !config ? {
                agente_nome: 'Luna',
                agente_genero: 'feminino',
                agente_cargo: 'Consultor(a) Especialista',
                unidade_nome: empresa.nome,
                unidade_email: empresa.email,
                servico_gratuito_nome: 'Diagnóstico Estratégico',
                servico_gratuito_duracao: '30 a 40 minutos',
                preco_texto_apresentacao: 'a partir de R$ 315 mensais',
            } : null,
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT: Atualizar configuração do agente
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
    try {
        const { isAdmin } = await verificarAdmin(req);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { id: empresaId } = await params;
        const body = await req.json();

        // Verificar se empresa existe
        const { data: empresa } = await supabaseAdmin
            .from('empresas')
            .select('id, nome')
            .eq('id', empresaId)
            .single();

        if (!empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        // Validar campos obrigatórios
        const validacao = validarConfig(body);
        if (!validacao.valido) {
            return NextResponse.json({
                error: 'Configuração inválida',
                campos_faltando: validacao.erros,
            }, { status: 400 });
        }

        // Preparar dados
        const configData = {
            empresa_id: empresaId,
            agente_nome: body.agente_nome,
            agente_genero: body.agente_genero || 'feminino',
            agente_cargo: body.agente_cargo || 'Consultor(a) Especialista',
            agente_personalidade: body.agente_personalidade || 'empática, profissional, consultiva',
            unidade_nome: body.unidade_nome,
            unidade_endereco_completo: body.unidade_endereco_completo,
            unidade_bairro: body.unidade_bairro,
            unidade_cidade: body.unidade_cidade,
            unidade_estado: body.unidade_estado,
            unidade_cep: body.unidade_cep,
            unidade_referencias: body.unidade_referencias,
            unidade_telefone: body.unidade_telefone,
            unidade_email: body.unidade_email,
            horario_segunda_a_sexta_inicio: body.horario_segunda_a_sexta_inicio || '09:00',
            horario_segunda_a_sexta_fim: body.horario_segunda_a_sexta_fim || '20:00',
            horario_sabado_inicio: body.horario_sabado_inicio || '08:00',
            horario_sabado_fim: body.horario_sabado_fim || '11:30',
            funciona_domingo: body.funciona_domingo || false,
            horario_domingo_inicio: body.horario_domingo_inicio,
            horario_domingo_fim: body.horario_domingo_fim,
            fecha_almoco: body.fecha_almoco || false,
            horario_almoco_inicio: body.horario_almoco_inicio,
            horario_almoco_fim: body.horario_almoco_fim,
            equipe: body.equipe || [],
            produto_nome: body.produto_nome || 'Curso',
            produto_descricao: body.produto_descricao,
            produto_duracao_media: body.produto_duracao_media,
            produto_modalidades: body.produto_modalidades || [],
            servico_gratuito_nome: body.servico_gratuito_nome || 'Diagnóstico Estratégico',
            servico_gratuito_descricao: body.servico_gratuito_descricao,
            servico_gratuito_duracao: body.servico_gratuito_duracao || '30 minutos',
            preco_minimo: body.preco_minimo,
            preco_maximo: body.preco_maximo,
            preco_texto_apresentacao: body.preco_texto_apresentacao || 'a partir de R$ 315 mensais',
            formas_pagamento: body.formas_pagamento || ['Cartão de Crédito', 'Boleto', 'Pix'],
            cursos: body.cursos || [],
            diferenciais: body.diferenciais || [],
            contexto_regional: body.contexto_regional,
            estacionamento_info: body.estacionamento_info,
            transporte_publico_info: body.transporte_publico_info,
            regras_negocio: body.regras_negocio || [],
            frases_proibidas: body.frases_proibidas || ['tipo', 'show', 'valeu', 'né'],
            frases_permitidas: body.frases_permitidas || ['Perfeito', 'Combinado', 'Faz sentido'],
            vocabulario_chave: body.vocabulario_chave || ['Transformação', 'Destravar', 'Confiança'],
            usar_emojis: body.usar_emojis !== false,
            tom_de_voz: body.tom_de_voz || 'profissional e empático',
            prompt_customizado: body.prompt_customizado,
            ativo: true,
            updated_at: new Date().toISOString(),
        };

        // Upsert
        const { data: config, error } = await supabaseAdmin
            .from('empresa_agente_config')
            .upsert(configData, { onConflict: 'empresa_id' })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Gerar preview do prompt
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        return NextResponse.json({
            success: true,
            message: `Configuração de "${empresa.nome}" salva com sucesso!`,
            config,
            prompt_preview: promptGerado,
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST: Sincronizar prompt com N8N
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { isAdmin } = await verificarAdmin(req);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { id: empresaId } = await params;
        const body = await req.json();

        if (body.action !== 'sync') {
            return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
        }

        // Buscar empresa
        const { data: empresa } = await supabaseAdmin
            .from('empresas')
            .select('id, nome, schema')
            .eq('id', empresaId)
            .single();

        if (!empresa) {
            return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
        }

        // Buscar configuração do agente
        const { data: config } = await supabaseAdmin
            .from('empresa_agente_config')
            .select('*')
            .eq('empresa_id', empresaId)
            .single();

        if (!config) {
            return NextResponse.json({
                error: 'Configuração do agente não encontrada. Salve primeiro.',
            }, { status: 404 });
        }

        // Buscar workflow ZAPI Principal
        const { data: workflow } = await supabaseAdmin
            .from('empresa_workflows')
            .select('workflow_id')
            .eq('empresa_id', empresaId)
            .eq('workflow_type', 'zapi-principal')
            .single();

        if (!workflow) {
            return NextResponse.json({
                error: 'Workflow ZAPI Principal não encontrado para esta empresa.',
            }, { status: 404 });
        }

        // Gerar prompt
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        // Atualizar workflow no N8N
        const { N8nClient } = await import('@/lib/n8n/client');
        const n8nClient = new N8nClient();

        const workflowAtual = await n8nClient.getWorkflow(workflow.workflow_id);

        if (!workflowAtual) {
            return NextResponse.json({
                error: 'Workflow não encontrado no N8N.',
            }, { status: 404 });
        }

        // Encontrar e atualizar o nó do AI Agent
        const nodes = workflowAtual.nodes || [];
        let agenteEncontrado = false;

        for (const node of nodes) {
            if (node.type === '@n8n/n8n-nodes-langchain.agent' ||
                node.type === 'n8n-nodes-langchain.agent' ||
                node.name?.toLowerCase().includes('agent')) {

                if (node.parameters) {
                    node.parameters.systemMessage = JSON.stringify(promptGerado, null, 2);
                    agenteEncontrado = true;
                }
            }
        }

        if (!agenteEncontrado) {
            return NextResponse.json({
                error: 'Nó do AI Agent não encontrado no workflow.',
            }, { status: 404 });
        }

        // Atualizar workflow
        await n8nClient.updateWorkflow(workflow.workflow_id, {
            nodes: nodes,
        });

        // Registrar atualização
        await supabaseAdmin
            .from('empresa_agente_config')
            .update({ updated_at: new Date().toISOString() })
            .eq('empresa_id', empresaId);

        return NextResponse.json({
            success: true,
            message: `Agente de "${empresa.nome}" sincronizado com N8N!`,
            workflow_id: workflow.workflow_id,
        });

    } catch (error: any) {
        console.error('Erro ao sincronizar:', error);
        return NextResponse.json({
            error: 'Erro ao sincronizar com N8N',
            details: error.message,
        }, { status: 500 });
    }
}

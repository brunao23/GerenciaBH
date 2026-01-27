/**
 * API: Configuração do Agente AI por Empresa
 * 
 * GET /api/empresas/[empresaId]/agente - Obter configuração
 * PUT /api/empresas/[empresaId]/agente - Atualizar configuração
 * POST /api/empresas/[empresaId]/agente/preview - Preview do prompt
 * POST /api/empresas/[empresaId]/agente/sync - Sincronizar com N8N
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarPromptAgente, gerarPreviewIdentidade, validarConfig, AgenteConfig } from '@/lib/agente/prompt-generator';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
    params: Promise<{ empresaId: string }>;
}

/**
 * GET: Obter configuração atual do agente
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { empresaId } = await params;

        // Buscar configuração
        const { data: config, error } = await supabaseAdmin
            .from('empresa_agente_config')
            .select('*')
            .eq('empresa_id', empresaId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = não encontrado
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Se não existe, retornar config padrão
        if (!config) {
            // Buscar dados da empresa para preencher defaults
            const { data: empresa } = await supabaseAdmin
                .from('empresas')
                .select('nome, email, telefone, endereco')
                .eq('id', empresaId)
                .single();

            return NextResponse.json({
                config: null,
                defaults: {
                    agente_nome: 'Luna',
                    agente_genero: 'feminino',
                    agente_cargo: 'Consultor(a) Especialista',
                    unidade_nome: empresa?.nome || 'Unidade',
                    unidade_email: empresa?.email,
                    unidade_telefone: empresa?.telefone,
                    unidade_endereco_completo: empresa?.endereco,
                    servico_gratuito_nome: 'Diagnóstico Estratégico',
                    servico_gratuito_duracao: '30 a 40 minutos',
                    preco_texto_apresentacao: 'a partir de R$ 315 mensais',
                },
                mensagem: 'Configuração não encontrada. Use os defaults para criar.'
            });
        }

        return NextResponse.json({
            config,
            preview_identidade: gerarPreviewIdentidade(config as unknown as Partial<AgenteConfig>),
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
        const { empresaId } = await params;
        const body = await req.json();

        // Validar campos obrigatórios
        const validacao = validarConfig(body);
        if (!validacao.valido) {
            return NextResponse.json({
                error: 'Configuração inválida',
                campos_faltando: validacao.erros,
            }, { status: 400 });
        }

        // Preparar dados para salvar
        const configData = {
            empresa_id: empresaId,

            // Identidade
            agente_nome: body.agente_nome,
            agente_genero: body.agente_genero || 'feminino',
            agente_cargo: body.agente_cargo || 'Consultor(a) Especialista',
            agente_personalidade: body.agente_personalidade || 'empática, profissional, consultiva',

            // Unidade
            unidade_nome: body.unidade_nome,
            unidade_endereco_completo: body.unidade_endereco_completo,
            unidade_bairro: body.unidade_bairro,
            unidade_cidade: body.unidade_cidade,
            unidade_estado: body.unidade_estado,
            unidade_cep: body.unidade_cep,
            unidade_referencias: body.unidade_referencias,
            unidade_telefone: body.unidade_telefone,
            unidade_email: body.unidade_email,

            // Horários
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

            // Equipe
            equipe: body.equipe || [],

            // Produto
            produto_nome: body.produto_nome || 'Curso',
            produto_descricao: body.produto_descricao,
            produto_duracao_media: body.produto_duracao_media,
            produto_modalidades: body.produto_modalidades || [],

            // Serviço gratuito
            servico_gratuito_nome: body.servico_gratuito_nome || 'Diagnóstico Estratégico',
            servico_gratuito_descricao: body.servico_gratuito_descricao,
            servico_gratuito_duracao: body.servico_gratuito_duracao || '30 minutos',

            // Preços
            preco_minimo: body.preco_minimo,
            preco_maximo: body.preco_maximo,
            preco_texto_apresentacao: body.preco_texto_apresentacao || 'a partir de R$ 315 mensais',
            formas_pagamento: body.formas_pagamento || ['Cartão de Crédito', 'Boleto', 'Pix'],

            // Cursos
            cursos: body.cursos || [],

            // Diferenciais
            diferenciais: body.diferenciais || [],

            // Contexto
            contexto_regional: body.contexto_regional,
            estacionamento_info: body.estacionamento_info,
            transporte_publico_info: body.transporte_publico_info,

            // Regras
            regras_negocio: body.regras_negocio || [],

            // Linguagem
            frases_proibidas: body.frases_proibidas || ['tipo', 'show', 'valeu', 'né'],
            frases_permitidas: body.frases_permitidas || ['Perfeito', 'Combinado', 'Faz sentido'],
            vocabulario_chave: body.vocabulario_chave || ['Transformação', 'Destravar', 'Confiança'],
            usar_emojis: body.usar_emojis !== false,
            tom_de_voz: body.tom_de_voz || 'profissional e empático',

            // Custom
            prompt_customizado: body.prompt_customizado,

            ativo: true,
            updated_at: new Date().toISOString(),
        };

        // Upsert (criar ou atualizar)
        const { data: config, error } = await supabaseAdmin
            .from('empresa_agente_config')
            .upsert(configData, { onConflict: 'empresa_id' })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Gerar prompt para mostrar preview
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        return NextResponse.json({
            success: true,
            message: 'Configuração salva com sucesso!',
            config,
            prompt_preview: promptGerado,
            proximo_passo: 'Clique em "Sincronizar com N8N" para atualizar o workflow',
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST: Preview do prompt (sem salvar)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const body = await req.json();

        // Se é ação de sync
        if (body.action === 'sync') {
            return await sincronizarComN8N(await params, body);
        }

        // Validar
        const validacao = validarConfig(body);
        if (!validacao.valido) {
            return NextResponse.json({
                error: 'Configuração incompleta',
                campos_faltando: validacao.erros,
            }, { status: 400 });
        }

        // Gerar preview
        const promptGerado = gerarPromptAgente(body as AgenteConfig);

        return NextResponse.json({
            preview: promptGerado,
            preview_identidade: gerarPreviewIdentidade(body),
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Sincroniza o prompt com o workflow N8N
 */
async function sincronizarComN8N(params: { empresaId: string }, body: any) {
    try {
        const { empresaId } = params;

        // Buscar configuração do agente
        const { data: config, error: configError } = await supabaseAdmin
            .from('empresa_agente_config')
            .select('*')
            .eq('empresa_id', empresaId)
            .single();

        if (configError || !config) {
            return NextResponse.json({
                error: 'Configuração do agente não encontrada. Salve primeiro.',
            }, { status: 404 });
        }

        // Buscar workflow ZAPI Principal da empresa
        const { data: workflow } = await supabaseAdmin
            .from('empresa_workflows')
            .select('workflow_id')
            .eq('empresa_id', empresaId)
            .eq('workflow_type', 'zapi-principal')
            .single();

        if (!workflow) {
            return NextResponse.json({
                error: 'Workflow ZAPI Principal não encontrado. Replique os workflows primeiro.',
            }, { status: 404 });
        }

        // Gerar prompt
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        // Atualizar workflow no N8N
        const { N8nClient } = await import('@/lib/n8n/client');
        const n8nClient = new N8nClient();

        // Buscar workflow atual
        const workflowAtual = await n8nClient.getWorkflow(workflow.workflow_id);

        if (!workflowAtual) {
            return NextResponse.json({
                error: 'Workflow não encontrado no N8N.',
            }, { status: 404 });
        }

        // Encontrar o nó do AI Agent e atualizar o prompt
        const nodes = workflowAtual.nodes || [];
        let agenteEncontrado = false;

        for (const node of nodes) {
            // Procurar pelo nó de AI Agent
            if (node.type === '@n8n/n8n-nodes-langchain.agent' ||
                node.type === 'n8n-nodes-langchain.agent' ||
                node.name?.toLowerCase().includes('agent')) {

                // Atualizar o prompt no nó
                if (node.parameters) {
                    node.parameters.systemMessage = JSON.stringify(promptGerado, null, 2);
                    agenteEncontrado = true;
                }
            }
        }

        if (!agenteEncontrado) {
            return NextResponse.json({
                error: 'Nó do AI Agent não encontrado no workflow.',
                sugestao: 'Verifique se o workflow tem um nó de AI Agent configurado.',
            }, { status: 404 });
        }

        // Atualizar workflow no N8N
        await n8nClient.updateWorkflow(workflow.workflow_id, {
            nodes: nodes,
        });

        // Registrar sincronização
        await supabaseAdmin
            .from('empresa_agente_config')
            .update({
                updated_at: new Date().toISOString(),
            })
            .eq('empresa_id', empresaId);

        return NextResponse.json({
            success: true,
            message: 'Prompt sincronizado com o workflow N8N!',
            workflow_id: workflow.workflow_id,
        });

    } catch (error: any) {
        console.error('Erro ao sincronizar com N8N:', error);
        return NextResponse.json({
            error: 'Erro ao sincronizar com N8N',
            details: error.message,
        }, { status: 500 });
    }
}

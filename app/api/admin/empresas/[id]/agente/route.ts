/**
 * API Admin: ConfiguraÃ§Ã£o do Agente AI por Empresa
 * 
 * GET /api/admin/empresas/[id]/agente - Obter configuraÃ§Ã£o
 * PUT /api/admin/empresas/[id]/agente - Atualizar configuraÃ§Ã£o
 * POST /api/admin/empresas/[id]/agente - Sincronizar com N8N
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/utils';
import { gerarPromptAgente, validarConfig, AgenteConfig } from '@/lib/agente/prompt-generator';
import { notifyAdminUpdate } from '@/lib/services/tenant-notifications';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * Verifica se o usuÃ¡rio Ã© admin
 */
async function verificarAdmin(req: NextRequest): Promise<{ isAdmin: boolean; userId?: string }> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth-token')?.value;
        if (token) {
            const session = await verifyToken(token);
            if (session?.isAdmin) {
                return { isAdmin: true, userId: session.userId };
            }
        }
    } catch {
        // Fallback abaixo
    }

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
 * GET: Obter configuraÃ§Ã£o do agente de uma empresa especÃ­fica
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
            return NextResponse.json({ error: 'Empresa nÃ£o encontrada' }, { status: 404 });
        }

        // Buscar configuraÃ§Ã£o
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
                servico_gratuito_nome: 'DiagnÃ³stico EstratÃ©gico',
                servico_gratuito_duracao: '30 a 40 minutos',
                preco_texto_apresentacao: 'a partir de R$ 315 mensais',
            } : null,
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT: Atualizar configuraÃ§Ã£o do agente
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
            .select('id, nome, schema')
            .eq('id', empresaId)
            .single();

        if (!empresa) {
            return NextResponse.json({ error: 'Empresa nÃ£o encontrada' }, { status: 404 });
        }

        // Validar campos obrigatÃ³rios
        const validacao = validarConfig(body);
        if (!validacao.valido) {
            return NextResponse.json({
                error: 'ConfiguraÃ§Ã£o invÃ¡lida',
                campos_faltando: validacao.erros,
            }, { status: 400 });
        }

        // Preparar dados
        const configData = {
            empresa_id: empresaId,
            agente_nome: body.agente_nome,
            agente_genero: body.agente_genero || 'feminino',
            agente_cargo: body.agente_cargo || 'Consultor(a) Especialista',
            agente_personalidade: body.agente_personalidade || 'empÃ¡tica, profissional, consultiva',
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
            servico_gratuito_nome: body.servico_gratuito_nome || 'DiagnÃ³stico EstratÃ©gico',
            servico_gratuito_descricao: body.servico_gratuito_descricao,
            servico_gratuito_duracao: body.servico_gratuito_duracao || '30 minutos',
            preco_minimo: body.preco_minimo,
            preco_maximo: body.preco_maximo,
            preco_texto_apresentacao: body.preco_texto_apresentacao || 'a partir de R$ 315 mensais',
            formas_pagamento: body.formas_pagamento || ['CartÃ£o de CrÃ©dito', 'Boleto', 'Pix'],
            cursos: body.cursos || [],
            diferenciais: body.diferenciais || [],
            contexto_regional: body.contexto_regional,
            estacionamento_info: body.estacionamento_info,
            transporte_publico_info: body.transporte_publico_info,
            regras_negocio: body.regras_negocio || [],
            frases_proibidas: body.frases_proibidas || ['tipo', 'show', 'valeu', 'nÃ©'],
            frases_permitidas: body.frases_permitidas || ['Perfeito', 'Combinado', 'Faz sentido'],
            vocabulario_chave: body.vocabulario_chave || ['TransformaÃ§Ã£o', 'Destravar', 'ConfianÃ§a'],
            usar_emojis: body.usar_emojis !== false,
            tom_de_voz: body.tom_de_voz || 'profissional e empÃ¡tico',
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

        if (empresa.schema) {
            await notifyAdminUpdate({
                tenant: empresa.schema,
                title: 'Configuracao do agente atualizada',
                message: `O administrador atualizou as configuracoes do agente da unidade ${empresa.nome}.`,
                sourceId: String(empresaId),
            }).catch((error) => {
                console.error('[Admin Agente] Erro ao enviar notificacao:', error);
            });
        }

        return NextResponse.json({
            success: true,
            message: `ConfiguraÃ§Ã£o de "${empresa.nome}" salva com sucesso!`,
            config,
            prompt_preview: promptGerado,
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST: Marcar agente como sincronizado
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { isAdmin } = await verificarAdmin(req);
        if (!isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
        const { id: empresaId } = await params;
        await supabaseAdmin.from("empresa_agente_config").update({ updated_at: new Date().toISOString() }).eq("empresa_id", empresaId);
        return NextResponse.json({ success: true, message: "Agente atualizado com sucesso." });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

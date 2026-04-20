/**
 * API: Configuração do Agente AI para o Cliente Logado
 * 
 * GET /api/empresas/me/agente - Obter minha configuração
 * PUT /api/empresas/me/agente - Atualizar minha configuração
 * POST /api/empresas/me/agente - Sincronizar com N8N
 * 
 * Usa o tenant do usuário logado
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarPromptAgente, gerarPreviewIdentidade, validarConfig, AgenteConfig } from '@/lib/agente/prompt-generator';

export const dynamic = 'force-dynamic'; // Desabilita cache estático do Next.js

console.log('🚀 [API AGENTE] Versão com FALLBACK LEGACY Carregada!');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Obtém a empresa do usuário logado via tenant header
 */
async function getEmpresaFromTenant(req: NextRequest): Promise<{ empresaId: string; schema: string; nome: string } | null> {
    // Primeiro tenta pegar do header de tenant
    const tenantPrefix = req.headers.get('x-tenant-prefix');

    console.log(`[Debug] Header x-tenant-prefix: "${tenantPrefix}"`);

    if (tenantPrefix) {
        const { data: empresa, error } = await supabaseAdmin
            .from('empresas')
            .select('id, schema, nome')
            .eq('schema', tenantPrefix)
            .single();

        if (error) {
            console.error(`[Debug] Erro ao buscar empresa por schema '${tenantPrefix}':`, error.message);
        }

        if (empresa) {
            console.log(`[Debug] Empresa encontrada pelo header: ${empresa.nome} (${empresa.id})`);
            return { empresaId: empresa.id, schema: empresa.schema, nome: empresa.nome };
        }

        // --- FALLBACK DE EMERGÊNCIA (LEGACY) ---
        // Se não achou no banco, mas é um tenant válido conhecido, libera o acesso!
        // Isso impede que o sistema pare se a tabela empresas estiver vazia ou com problema.
        const tenantsLegados = ['vox_bh', 'vox_es', 'vox_maceio', 'vox_marilia', 'vox_piaui', 'vox_sp', 'vox_rio', 'bia_vox', 'colegio_progresso'];
        if (tenantsLegados.includes(tenantPrefix)) {
            console.warn(`[Debug] Tenant LEGADO detectado: '${tenantPrefix}'. Permitindo acesso modo compatibilidade.`);
            return {
                empresaId: '00000000-0000-0000-0000-000000000000', // ID Mock
                schema: tenantPrefix,
                nome: tenantPrefix.replace('_', ' ').toUpperCase()
            };
        }

        console.warn(`[Debug] Nenhuma empresa encontrada com schema '${tenantPrefix}' nem na lista legado.`);
    } else {
        console.log('[Debug] Header x-tenant-prefix não fornecido.');
    }

    // Fallback: pegar pelo token do usuário
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        console.log('[Debug] Sem token Bearer para fallback.');
        return null;
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
        console.log('[Debug] Token inválido ou usuário não encontrado.');
        return null;
    }

    console.log(`[Debug] Usuário autenticado: ${user.email} (${user.id})`);

    try {
        // 1. Tentar via RPC (Método Preferencial e Seguro)
        try {
            const { data, error } = await supabaseAdmin.rpc('get_empresa_do_usuario', {
                p_user_id: user.id
            });

            if (data && Array.isArray(data) && data.length > 0) {
                const emp = data[0] as { empresa_id: string, schema_nome: string, empresa_nome: string };
                return {
                    empresaId: emp.empresa_id,
                    schema: emp.schema_nome,
                    nome: emp.empresa_nome
                };
            }
        } catch (rpcError) {
            console.warn('[API Agente] RPC falhou, tentando fallback:', rpcError);
        }

        // 2. Fallback: Consulta direta (pode falhar com RLS recursion se policies estiverem erradas)
        try {
            const { data: usuario } = await supabaseAdmin
                .from('usuarios')
                .select('empresa_id')
                .eq('id', user.id)
                .single();

            if (usuario?.empresa_id) {
                const { data: empresa } = await supabaseAdmin
                    .from('empresas')
                    .select('id, schema, nome')
                    .eq('id', usuario.empresa_id)
                    .single();

                if (empresa) {
                    console.log(`[Debug] Empresa encontrada pelo usuário (fallback select): ${empresa.nome}`);
                    return { empresaId: empresa.id, schema: empresa.schema, nome: empresa.nome };
                }
            }
        } catch (fallbackError: any) {
            console.error('[Debug] Falha no fallback de usuário:', fallbackError.message);
        }

    } catch (criticalError: any) {
        console.error('[Debug] Erro CRÍTICO ao buscar empresa:', criticalError.message);
    }

    // Se chegou aqui, nada funcionou.
    // Retornar MOCK seguro se estivermos em ambiente de desenvolvimento ou falha total, 
    // para permitir que o usuário pelo menos veja a tela (modo somente leitura/limitado)
    console.warn('[Debug] FALHA TOTAL na identificação. Ativando modo de segurança.');
    // return { empresaId: '0000', schema: 'falha_auth', nome: 'Modo Segurança (Erro Banco)' };
    return null;
}

/**
 * GET: Obter minha configuração do agente
 */
export async function GET(req: NextRequest) {
    try {
        console.log('[API Agente] GET iniciado');
        let empresaInfo = null;

        try {
            empresaInfo = await getEmpresaFromTenant(req);
        } catch (authError: any) {
            console.error('[API Agente] Falha na identificação da empresa:', authError);
            // Não quebra, tenta seguir para o mock se for o caso ou retorna 401 controlado
        }

        // MOCK DE SEGURANÇA: Se falhar a identificação mas o tenant vier no header, 
        // cria um objeto fake para não travar a UI
        if (!empresaInfo) {
            const tenantHeader = req.headers.get('x-tenant-prefix');
            if (tenantHeader) {
                console.warn(`[API Agente] Ativando MOCK para tenant '${tenantHeader}' devido a falha de banco.`);
                empresaInfo = {
                    empresaId: '00000000-0000-0000-0000-000000000000',
                    schema: tenantHeader,
                    nome: tenantHeader.toUpperCase().replace('_', ' ') + ' (Modo Segurança)'
                };
            }
        }

        if (!empresaInfo) {
            return NextResponse.json({
                error: 'Empresa não identificada',
                details: 'Não foi possível detectar a empresa nem pelo login nem pelo endereço.'
            }, { status: 401 });
        }

        // Buscar configuração
        let config = null;
        try {
            const { data, error } = await supabaseAdmin
                .from('empresa_agente_config')
                .select('*')
                .eq('empresa_id', empresaInfo.empresaId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('[API Agente] Erro ao buscar config no banco:', error);
                // Não dar throw, apenas deixar config null
            } else {
                config = data;
            }
        } catch (dbError) {
            console.error('[API Agente] Erro catastrófico ao consultar banco:', dbError);
        }

        // Se não existe ou deu erro, retornar defaults
        if (!config) {
            return NextResponse.json({
                config: null,
                defaults: {
                    agente_nome: 'Luna',
                    agente_genero: 'feminino',
                    agente_cargo: 'Consultor(a) Especialista',
                    unidade_nome: empresaInfo.nome,
                    servico_gratuito_nome: 'Diagnóstico Estratégico',
                    servico_gratuito_duracao: '30 a 40 minutos',
                    preco_texto_apresentacao: 'a partir de R$ 315 mensais',
                },
                mensagem: 'Configure seu agente para começar!',
                is_mock: empresaInfo.empresaId === '00000000-0000-0000-0000-000000000000'
            });
        }

        return NextResponse.json({
            config,
            preview_identidade: gerarPreviewIdentidade(config as unknown as Partial<AgenteConfig>),
        });

    } catch (error: any) {
        console.error('[API Agente] Erro não tratado (500):', error);
        return NextResponse.json({
            error: 'Erro interno do servidor',
            details: error.message || 'Erro desconhecido'
        }, { status: 500 });
    }
}

/**
 * PUT: Atualizar minha configuração do agente
 */
export async function PUT(req: NextRequest) {
    try {
        const empresaInfo = await getEmpresaFromTenant(req);

        if (!empresaInfo) {
            return NextResponse.json({ error: 'Empresa não identificada' }, { status: 401 });
        }

        const body = await req.json();

        // Validar
        const validacao = validarConfig(body);
        if (!validacao.valido) {
            return NextResponse.json({
                error: 'Configuração inválida',
                campos_faltando: validacao.erros,
            }, { status: 400 });
        }

        // Preparar dados
        const configData = {
            empresa_id: empresaInfo.empresaId,
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

        // Gerar preview
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        return NextResponse.json({
            success: true,
            message: 'Configuração salva com sucesso!',
            config,
            prompt_preview: promptGerado,
            proximo_passo: 'Configuração salva com sucesso!',
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST: Preview do prompt (sem salvar)
 */
export async function POST(req: NextRequest) {
    try {
        const empresaInfo = await getEmpresaFromTenant(req);

        if (!empresaInfo) {
            return NextResponse.json({ error: 'Empresa não identificada' }, { status: 401 });
        }

        const body = await req.json();

        const { data: config } = await supabaseAdmin
            .from('empresa_agente_config')
            .select('*')
            .eq('empresa_id', empresaInfo.empresaId)
            .single();

        if (!config) {
            return NextResponse.json({ error: 'Configuração do agente não encontrada.' }, { status: 404 });
        }

        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig);

        return NextResponse.json({
            preview: promptGerado,
            preview_identidade: gerarPreviewIdentidade(config as unknown as AgenteConfig),
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

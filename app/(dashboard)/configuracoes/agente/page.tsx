'use client';

import { useState, useEffect } from 'react';
import { useTenantFetch } from '@/hooks/useTenantFetch';
import {
    Bot, Save, RefreshCw, Eye, ChevronDown, ChevronUp,
    User, Building, Clock, Users, Package, DollarSign,
    MapPin, Settings, MessageSquare, Sparkles, Check,
    AlertCircle, Info, Shield, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EquipeMembro {
    nome: string;
    cargo: string;
}

interface Curso {
    nome: string;
    descricao: string;
    duracao: string;
}

interface AgenteConfig {
    // Identidade
    agente_nome: string;
    agente_genero: 'feminino' | 'masculino';
    agente_cargo: string;
    agente_personalidade: string;

    // Unidade
    unidade_nome: string;
    unidade_endereco_completo: string;
    unidade_bairro: string;
    unidade_cidade: string;
    unidade_estado: string;
    unidade_cep: string;
    unidade_referencias: string;
    unidade_telefone: string;
    unidade_email: string;

    // Horários
    horario_segunda_a_sexta_inicio: string;
    horario_segunda_a_sexta_fim: string;
    horario_sabado_inicio: string;
    horario_sabado_fim: string;
    funciona_domingo: boolean;
    horario_domingo_inicio?: string;
    horario_domingo_fim?: string;
    fecha_almoco: boolean;
    horario_almoco_inicio?: string;
    horario_almoco_fim?: string;

    // Equipe
    equipe: EquipeMembro[];

    // Produto
    produto_nome: string;
    produto_descricao: string;
    produto_duracao_media: string;
    produto_modalidades: string[];

    // Serviço gratuito
    servico_gratuito_nome: string;
    servico_gratuito_descricao: string;
    servico_gratuito_duracao: string;

    // Preços
    preco_minimo: number;
    preco_maximo: number;
    preco_texto_apresentacao: string;
    formas_pagamento: string[];

    // Cursos
    cursos: Curso[];

    // Diferenciais
    diferenciais: string[];

    // Contexto
    contexto_regional: string;
    estacionamento_info: string;
    transporte_publico_info: string;

    // Regras
    regras_negocio: string[];

    // Linguagem
    frases_proibidas: string[];
    frases_permitidas: string[];
    vocabulario_chave: string[];
    usar_emojis: boolean;
    tom_de_voz: string;
}

const defaultConfig: AgenteConfig = {
    agente_nome: 'Luna',
    agente_genero: 'feminino',
    agente_cargo: 'Consultor(a) Especialista',
    agente_personalidade: 'empática, profissional, consultiva',
    unidade_nome: '',
    unidade_endereco_completo: '',
    unidade_bairro: '',
    unidade_cidade: '',
    unidade_estado: '',
    unidade_cep: '',
    unidade_referencias: '',
    unidade_telefone: '',
    unidade_email: '',
    horario_segunda_a_sexta_inicio: '09:00',
    horario_segunda_a_sexta_fim: '20:00',
    horario_sabado_inicio: '08:00',
    horario_sabado_fim: '11:30',
    funciona_domingo: false,
    fecha_almoco: false,
    equipe: [],
    produto_nome: 'Curso',
    produto_descricao: '',
    produto_duracao_media: '',
    produto_modalidades: ['Presencial'],
    servico_gratuito_nome: 'Diagnóstico Estratégico',
    servico_gratuito_descricao: 'Avaliação personalizada gratuita',
    servico_gratuito_duracao: '30 a 40 minutos',
    preco_minimo: 0,
    preco_maximo: 0,
    preco_texto_apresentacao: 'a partir de R$ 315 mensais',
    formas_pagamento: ['Cartão de Crédito', 'Boleto', 'Pix'],
    cursos: [],
    diferenciais: [],
    contexto_regional: '',
    estacionamento_info: '',
    transporte_publico_info: '',
    regras_negocio: [],
    frases_proibidas: ['tipo', 'show', 'valeu', 'né', 'tô', 'pra'],
    frases_permitidas: ['Perfeito', 'Combinado', 'Faz sentido', 'Entendi'],
    vocabulario_chave: ['Transformação', 'Destravar', 'Confiança', 'Evolução'],
    usar_emojis: true,
    tom_de_voz: 'profissional e empático',
};

interface SectionProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-[#1a1a2e] rounded-xl border border-white/10 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                        {icon}
                    </div>
                    <span className="font-semibold text-white">{title}</span>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {isOpen && (
                <div className="p-4 pt-0 border-t border-white/5">
                    {children}
                </div>
            )}
        </div>
    );
}

export default function ConfiguracaoAgentePage() {
    const { fetchWithTenant: tenantFetch, tenant, loading: tenantLoading } = useTenantFetch();
    const [config, setConfig] = useState<AgenteConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [previewPrompt, setPreviewPrompt] = useState<any>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [novoMembro, setNovoMembro] = useState({ nome: '', cargo: '' });
    const [novoCurso, setNovoCurso] = useState({ nome: '', descricao: '', duracao: '' });
    const [novoDiferencial, setNovoDiferencial] = useState('');
    const [novaRegra, setNovaRegra] = useState('');
    const [errorDetails, setErrorDetails] = useState<any>(null);

    const [isFirstLoad, setIsFirstLoad] = useState(true);

    // Carregar configuração
    useEffect(() => {
        if (tenantLoading) return;

        if (!tenant) {
            setLoading(false);
            setIsFirstLoad(false);
            return;
        }

        async function loadConfig() {
            try {
                // Só mostra loading full-screen na primeira vez
                if (isFirstLoad) setLoading(true);

                const response = await tenantFetch('/api/empresas/me/agente');
                const data = response;

                if (data.error) {
                    throw { message: data.error, details: data.details };
                }

                if (data.config) {
                    setConfig({ ...defaultConfig, ...data.config });
                } else if (data.defaults) {
                    setConfig({ ...defaultConfig, ...data.defaults });
                }

                if (data.preview_identidade) {
                    setPreviewPrompt(data.preview_identidade);
                }

            } catch (error: any) {
                console.error('Erro ao carregar config:', error);

                let msg = error.message || 'Erro desconhecido';
                let details = error.details || error;

                if (error instanceof Response) {
                    try {
                        const errBody = await error.json();
                        msg = errBody.error || msg;
                        details = errBody.details || details;
                    } catch (e) { /* ignore */ }
                }

                setErrorDetails({ message: msg, details });
            } finally {
                setLoading(false);
                setIsFirstLoad(false);
            }
        }

        loadConfig();
    }, [tenantLoading, tenant, tenantFetch]);

    // Salvar configuração
    async function handleSave() {
        setSaving(true);
        setMessage(null);

        try {
            const response = await tenantFetch('/api/empresas/me/agente', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: 'Configuração salva com sucesso!' });
                if (data.prompt_preview) {
                    setPreviewPrompt(data.prompt_preview);
                }
            } else {
                setMessage({ type: 'error', text: data.error || 'Erro ao salvar' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão' });
        } finally {
            setSaving(false);
        }
    }

    // Sincronizar com N8N
    async function handleSync() {
        setSyncing(true);
        setMessage(null);

        try {
            const response = await tenantFetch('/api/empresas/me/agente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: '✅ Agente sincronizado com sucesso! As mudanças já estão ativas.' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Erro ao sincronizar' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão' });
        } finally {
            setSyncing(false);
        }
    }

    // Adicionar membro da equipe
    function addMembro() {
        if (novoMembro.nome && novoMembro.cargo) {
            setConfig(prev => ({
                ...prev,
                equipe: [...prev.equipe, { ...novoMembro }]
            }));
            setNovoMembro({ nome: '', cargo: '' });
        }
    }

    // Remover membro
    function removeMembro(index: number) {
        setConfig(prev => ({
            ...prev,
            equipe: prev.equipe.filter((_, i) => i !== index)
        }));
    }

    // Adicionar curso
    function addCurso() {
        if (novoCurso.nome) {
            setConfig(prev => ({
                ...prev,
                cursos: [...prev.cursos, { ...novoCurso }]
            }));
            setNovoCurso({ nome: '', descricao: '', duracao: '' });
        }
    }

    // Remover curso
    function removeCurso(index: number) {
        setConfig(prev => ({
            ...prev,
            cursos: prev.cursos.filter((_, i) => i !== index)
        }));
    }

    // Adicionar diferencial
    function addDiferencial() {
        if (novoDiferencial) {
            setConfig(prev => ({
                ...prev,
                diferenciais: [...prev.diferenciais, novoDiferencial]
            }));
            setNovoDiferencial('');
        }
    }

    // Adicionar regra
    function addRegra() {
        if (novaRegra) {
            setConfig(prev => ({
                ...prev,
                regras_negocio: [...prev.regras_negocio, novaRegra]
            }));
            setNovaRegra('');
        }
    }

    // Renderização com prioridades corretas para evitar flickering

    // 1. Carregando Tenant (Contexto)
    if (tenantLoading) {
        return (
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-white">Carregando ambiente...</span>
                </div>
            </div>
        );
    }

    // 2. Erro Crítico (Mostra mesmo se tiver tenant, pois impediu load da config)
    if (errorDetails) {
        return (
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-6">
                <div className="max-w-md w-full p-6 bg-red-50 border border-red-200 rounded-lg text-red-800 shadow-xl">
                    <h3 className="font-bold flex items-center gap-2 text-lg mb-2">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                        Erro ao carregar configurações
                    </h3>
                    <p className="mb-4 text-sm">{errorDetails.message}</p>

                    {errorDetails.details && (
                        <div className="mb-4">
                            <p className="text-xs font-semibold uppercase text-red-600 mb-1">Detalhes Técnicos:</p>
                            <pre className="p-3 bg-red-100 rounded text-xs overflow-auto max-h-40 font-mono border border-red-200">
                                {typeof errorDetails.details === 'object'
                                    ? JSON.stringify(errorDetails.details, null, 2)
                                    : errorDetails.details}
                            </pre>
                        </div>
                    )}

                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium"
                    >
                        Tentar Novamente
                    </button>

                    <div className="mt-4 pt-4 border-t border-red-200 text-center">
                        <Link href="/admin/agentes" className="text-sm text-red-600 hover:underline">
                            Voltar para Painel Admin
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // 3. Sem Tenant Selecionado
    if (!tenant) {
        return (
            <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center p-12 text-center">
                <Shield className="w-16 h-16 text-gray-600 mb-6" />
                <h2 className="text-2xl font-bold text-white mb-2">Nenhuma empresa selecionada</h2>
                <p className="text-gray-400 max-w-md mb-8">
                    Para configurar o Agente IA, você precisa selecionar uma empresa no menu superior ou painel de controle.
                </p>
                <Link href="/admin/agentes">
                    <Button className="bg-purple-600 hover:bg-purple-700">
                        Ir para Painel Master
                    </Button>
                </Link>
            </div>
        );
    }

    // 4. Carregando Dados da Config (Primeira vez apenas)
    if (loading && isFirstLoad) {
        return (
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-white">Carregando configurações...</span>
                </div>
            </div>
        );
    }

    // 5. App Carregado (Formulário)
    return (
        <div className="min-h-screen bg-[#0f0f1a] p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
                            <Bot className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Configuração do Agente AI</h1>
                            <p className="text-gray-400">Personalize seu assistente virtual</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                            Preview
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar
                        </button>
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Sincronizar N8N
                        </button>
                    </div>
                </div>

                {/* Mensagem */}
                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        {message.text}
                    </div>
                )}

                {/* Preview do Prompt */}
                {showPreview && previewPrompt && (
                    <div className="bg-[#1a1a2e] rounded-xl border border-white/10 p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Preview do Prompt</h3>
                        <pre className="bg-black/30 p-4 rounded-lg text-xs text-gray-300 overflow-auto max-h-96">
                            {JSON.stringify(previewPrompt, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Seção: Identidade do Agente */}
                <Section title="Identidade do Agente" icon={<User className="w-5 h-5 text-purple-400" />}>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Nome do Agente</label>
                            <input
                                type="text"
                                value={config.agente_nome}
                                onChange={(e) => setConfig(prev => ({ ...prev, agente_nome: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Luna, Ana, Carlos..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Gênero</label>
                            <select
                                value={config.agente_genero}
                                onChange={(e) => setConfig(prev => ({ ...prev, agente_genero: e.target.value as 'feminino' | 'masculino' }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            >
                                <option value="feminino">Feminino</option>
                                <option value="masculino">Masculino</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Cargo</label>
                            <input
                                type="text"
                                value={config.agente_cargo}
                                onChange={(e) => setConfig(prev => ({ ...prev, agente_cargo: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Consultor(a) Especialista"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Tom de Voz</label>
                            <input
                                type="text"
                                value={config.tom_de_voz}
                                onChange={(e) => setConfig(prev => ({ ...prev, tom_de_voz: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: profissional e empático"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Personalidade</label>
                            <input
                                type="text"
                                value={config.agente_personalidade}
                                onChange={(e) => setConfig(prev => ({ ...prev, agente_personalidade: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: empática, profissional, consultiva"
                            />
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="usar_emojis"
                                checked={config.usar_emojis}
                                onChange={(e) => setConfig(prev => ({ ...prev, usar_emojis: e.target.checked }))}
                                className="w-4 h-4 rounded bg-black/30 border-white/10"
                            />
                            <label htmlFor="usar_emojis" className="text-sm text-gray-300">Usar emojis nas conversas</label>
                        </div>
                    </div>
                </Section>

                {/* Seção: Informações da Unidade */}
                <Section title="Informações da Unidade" icon={<Building className="w-5 h-5 text-blue-400" />}>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Nome da Unidade *</label>
                            <input
                                type="text"
                                value={config.unidade_nome}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_nome: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Vox2You Vitória"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Endereço Completo</label>
                            <input
                                type="text"
                                value={config.unidade_endereco_completo}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_endereco_completo: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Rua, número, sala, edifício..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Bairro</label>
                            <input
                                type="text"
                                value={config.unidade_bairro}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_bairro: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Cidade *</label>
                            <input
                                type="text"
                                value={config.unidade_cidade}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_cidade: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Estado</label>
                            <input
                                type="text"
                                value={config.unidade_estado}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_estado: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: ES, SP, RJ..."
                                maxLength={2}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">CEP</label>
                            <input
                                type="text"
                                value={config.unidade_cep}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_cep: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Referências</label>
                            <input
                                type="text"
                                value={config.unidade_referencias}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_referencias: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Em frente ao Restaurante X, próximo ao Shopping Y"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Telefone</label>
                            <input
                                type="text"
                                value={config.unidade_telefone}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_telefone: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Email</label>
                            <input
                                type="email"
                                value={config.unidade_email}
                                onChange={(e) => setConfig(prev => ({ ...prev, unidade_email: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Contexto Regional</label>
                            <textarea
                                value={config.contexto_regional}
                                onChange={(e) => setConfig(prev => ({ ...prev, contexto_regional: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Descreva o contexto da região (trânsito, pontos de referência, etc.)"
                                rows={2}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Informações de Estacionamento</label>
                            <textarea
                                value={config.estacionamento_info}
                                onChange={(e) => setConfig(prev => ({ ...prev, estacionamento_info: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                rows={2}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Transporte Público</label>
                            <textarea
                                value={config.transporte_publico_info}
                                onChange={(e) => setConfig(prev => ({ ...prev, transporte_publico_info: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                rows={2}
                            />
                        </div>
                    </div>
                </Section>

                {/* Seção: Horários */}
                <Section title="Horários de Funcionamento" icon={<Clock className="w-5 h-5 text-green-400" />}>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Segunda a Sexta - Início</label>
                            <input
                                type="time"
                                value={config.horario_segunda_a_sexta_inicio}
                                onChange={(e) => setConfig(prev => ({ ...prev, horario_segunda_a_sexta_inicio: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Segunda a Sexta - Fim</label>
                            <input
                                type="time"
                                value={config.horario_segunda_a_sexta_fim}
                                onChange={(e) => setConfig(prev => ({ ...prev, horario_segunda_a_sexta_fim: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Sábado - Início</label>
                            <input
                                type="time"
                                value={config.horario_sabado_inicio}
                                onChange={(e) => setConfig(prev => ({ ...prev, horario_sabado_inicio: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Sábado - Fim</label>
                            <input
                                type="time"
                                value={config.horario_sabado_fim}
                                onChange={(e) => setConfig(prev => ({ ...prev, horario_sabado_fim: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2 flex items-center gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={config.funciona_domingo}
                                    onChange={(e) => setConfig(prev => ({ ...prev, funciona_domingo: e.target.checked }))}
                                    className="w-4 h-4 rounded bg-black/30 border-white/10"
                                />
                                <span className="text-sm text-gray-300">Funciona domingo</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={config.fecha_almoco}
                                    onChange={(e) => setConfig(prev => ({ ...prev, fecha_almoco: e.target.checked }))}
                                    className="w-4 h-4 rounded bg-black/30 border-white/10"
                                />
                                <span className="text-sm text-gray-300">Fecha para almoço</span>
                            </label>
                        </div>
                    </div>
                </Section>

                {/* Seção: Equipe */}
                <Section title="Equipe" icon={<Users className="w-5 h-5 text-orange-400" />}>
                    <div className="mt-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={novoMembro.nome}
                                onChange={(e) => setNovoMembro(prev => ({ ...prev, nome: e.target.value }))}
                                className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Nome"
                            />
                            <input
                                type="text"
                                value={novoMembro.cargo}
                                onChange={(e) => setNovoMembro(prev => ({ ...prev, cargo: e.target.value }))}
                                className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Cargo"
                            />
                            <button
                                onClick={addMembro}
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                            >
                                Adicionar
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {config.equipe.map((membro, index) => (
                                <span
                                    key={index}
                                    className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm text-white"
                                >
                                    {membro.nome} ({membro.cargo})
                                    <button
                                        onClick={() => removeMembro(index)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            O agente mencionará esses nomes para parecer mais humano
                        </p>
                    </div>
                </Section>

                {/* Seção: Produto/Serviço */}
                <Section title="Produto / Serviço" icon={<Package className="w-5 h-5 text-pink-400" />}>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Nome do Produto/Curso</label>
                            <input
                                type="text"
                                value={config.produto_nome}
                                onChange={(e) => setConfig(prev => ({ ...prev, produto_nome: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Curso de Oratória"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Duração Média</label>
                            <input
                                type="text"
                                value={config.produto_duracao_media}
                                onChange={(e) => setConfig(prev => ({ ...prev, produto_duracao_media: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: 6 meses"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                            <textarea
                                value={config.produto_descricao}
                                onChange={(e) => setConfig(prev => ({ ...prev, produto_descricao: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                rows={2}
                            />
                        </div>

                        <div className="col-span-2 border-t border-white/10 pt-4 mt-2">
                            <label className="block text-sm text-gray-400 mb-2">Serviço Gratuito (Diagnóstico/Avaliação)</label>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={config.servico_gratuito_nome}
                                    onChange={(e) => setConfig(prev => ({ ...prev, servico_gratuito_nome: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    placeholder="Nome (ex: Diagnóstico Estratégico)"
                                />
                                <input
                                    type="text"
                                    value={config.servico_gratuito_duracao}
                                    onChange={(e) => setConfig(prev => ({ ...prev, servico_gratuito_duracao: e.target.value }))}
                                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    placeholder="Duração (ex: 30 minutos)"
                                />
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Seção: Cursos */}
                <Section title="Cursos / Modalidades" icon={<Package className="w-5 h-5 text-cyan-400" />} defaultOpen={false}>
                    <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            <input
                                type="text"
                                value={novoCurso.nome}
                                onChange={(e) => setNovoCurso(prev => ({ ...prev, nome: e.target.value }))}
                                className="px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Nome do curso"
                            />
                            <input
                                type="text"
                                value={novoCurso.descricao}
                                onChange={(e) => setNovoCurso(prev => ({ ...prev, descricao: e.target.value }))}
                                className="px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Descrição breve"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={novoCurso.duracao}
                                    onChange={(e) => setNovoCurso(prev => ({ ...prev, duracao: e.target.value }))}
                                    className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    placeholder="Duração"
                                />
                                <button
                                    onClick={addCurso}
                                    className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {config.cursos.map((curso, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                                >
                                    <div>
                                        <span className="font-medium text-white">{curso.nome}</span>
                                        <span className="text-gray-400 text-sm ml-2">- {curso.descricao}</span>
                                        <span className="text-gray-500 text-sm ml-2">({curso.duracao})</span>
                                    </div>
                                    <button
                                        onClick={() => removeCurso(index)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* Seção: Preços */}
                <Section title="Preços" icon={<DollarSign className="w-5 h-5 text-emerald-400" />}>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Preço Mínimo (R$)</label>
                            <input
                                type="number"
                                value={config.preco_minimo}
                                onChange={(e) => setConfig(prev => ({ ...prev, preco_minimo: Number(e.target.value) }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Preço Máximo (R$)</label>
                            <input
                                type="number"
                                value={config.preco_maximo}
                                onChange={(e) => setConfig(prev => ({ ...prev, preco_maximo: Number(e.target.value) }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm text-gray-400 mb-1">Texto de Apresentação de Preço</label>
                            <input
                                type="text"
                                value={config.preco_texto_apresentacao}
                                onChange={(e) => setConfig(prev => ({ ...prev, preco_texto_apresentacao: e.target.value }))}
                                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: a partir de R$ 315 mensais"
                            />
                            <p className="text-xs text-gray-500 mt-1">Este é o texto que o agente usará quando revelar o preço</p>
                        </div>
                    </div>
                </Section>

                {/* Seção: Diferenciais */}
                <Section title="Diferenciais" icon={<Sparkles className="w-5 h-5 text-yellow-400" />} defaultOpen={false}>
                    <div className="mt-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={novoDiferencial}
                                onChange={(e) => setNovoDiferencial(e.target.value)}
                                className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Método 100% prático, Turmas reduzidas..."
                            />
                            <button
                                onClick={addDiferencial}
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                            >
                                Adicionar
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {config.diferenciais.map((dif, index) => (
                                <span
                                    key={index}
                                    className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 text-sm text-yellow-400"
                                >
                                    ⭐ {dif}
                                    <button
                                        onClick={() => setConfig(prev => ({
                                            ...prev,
                                            diferenciais: prev.diferenciais.filter((_, i) => i !== index)
                                        }))}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* Seção: Regras do Negócio */}
                <Section title="Regras do Negócio" icon={<Settings className="w-5 h-5 text-red-400" />} defaultOpen={false}>
                    <div className="mt-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={novaRegra}
                                onChange={(e) => setNovaRegra(e.target.value)}
                                className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                placeholder="Ex: Não agendamos sábado à tarde"
                            />
                            <button
                                onClick={addRegra}
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                            >
                                Adicionar
                            </button>
                        </div>
                        <div className="space-y-2">
                            {config.regras_negocio.map((regra, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                                >
                                    <span className="text-red-400">⚠️ {regra}</span>
                                    <button
                                        onClick={() => setConfig(prev => ({
                                            ...prev,
                                            regras_negocio: prev.regras_negocio.filter((_, i) => i !== index)
                                        }))}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            O agente seguirá essas regras rigorosamente
                        </p>
                    </div>
                </Section>

                {/* Seção: Linguagem */}
                <Section title="Configurações de Linguagem" icon={<MessageSquare className="w-5 h-5 text-indigo-400" />} defaultOpen={false}>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Frases Proibidas</label>
                            <div className="flex flex-wrap gap-2">
                                {config.frases_proibidas.map((frase, index) => (
                                    <span
                                        key={index}
                                        className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-xs text-red-400"
                                    >
                                        {frase}
                                        <button
                                            onClick={() => setConfig(prev => ({
                                                ...prev,
                                                frases_proibidas: prev.frases_proibidas.filter((_, i) => i !== index)
                                            }))}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Frases Permitidas</label>
                            <div className="flex flex-wrap gap-2">
                                {config.frases_permitidas.map((frase, index) => (
                                    <span
                                        key={index}
                                        className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-xs text-green-400"
                                    >
                                        {frase}
                                        <button
                                            onClick={() => setConfig(prev => ({
                                                ...prev,
                                                frases_permitidas: prev.frases_permitidas.filter((_, i) => i !== index)
                                            }))}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Vocabulário Chave</label>
                            <div className="flex flex-wrap gap-2">
                                {config.vocabulario_chave.map((palavra, index) => (
                                    <span
                                        key={index}
                                        className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-xs text-purple-400"
                                    >
                                        {palavra}
                                        <button
                                            onClick={() => setConfig(prev => ({
                                                ...prev,
                                                vocabulario_chave: prev.vocabulario_chave.filter((_, i) => i !== index)
                                            }))}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Salvar Configurações
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {syncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        Sincronizar com N8N
                    </button>
                </div>
            </div>
        </div>
    );
}

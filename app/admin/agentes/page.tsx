'use client';

import { useState, useEffect } from 'react';
import {
    Bot, Save, RefreshCw, Eye, ChevronDown, ChevronUp,
    User, Building, Clock, Users, Package, DollarSign,
    Settings, MessageSquare, Sparkles, Check, Search,
    AlertCircle, Info, Building2, ArrowLeft
} from 'lucide-react';

interface Empresa {
    id: string;
    nome: string;
    schema: string;
    email: string;
    ativo: boolean;
}

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
        <div className="bg-[#1e1e2e] rounded-xl border border-white/10 overflow-hidden">
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

export default function AdminAgentesPage() {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
    const [config, setConfig] = useState<AgenteConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [previewPrompt, setPreviewPrompt] = useState<any>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [novoMembro, setNovoMembro] = useState({ nome: '', cargo: '' });
    const [novoCurso, setNovoCurso] = useState({ nome: '', descricao: '', duracao: '' });
    const [novoDiferencial, setNovoDiferencial] = useState('');
    const [novaRegra, setNovaRegra] = useState('');

    // Carregar lista de empresas
    useEffect(() => {
        async function loadEmpresas() {
            try {
                const token = localStorage.getItem('token') || sessionStorage.getItem('supabase.auth.token');
                const response = await fetch('/api/admin/empresas', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await response.json();

                if (data.empresas) {
                    setEmpresas(data.empresas);
                }
            } catch (error) {
                console.error('Erro ao carregar empresas:', error);
            } finally {
                setLoading(false);
            }
        }

        loadEmpresas();
    }, []);

    // Carregar configuração da empresa selecionada
    async function loadConfig(empresa: Empresa) {
        setLoadingConfig(true);
        setSelectedEmpresa(empresa);
        setMessage(null);

        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('supabase.auth.token');
            const response = await fetch(`/api/admin/empresas/${empresa.id}/agente`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();

            if (data.config) {
                setConfig({ ...defaultConfig, ...data.config });
            } else {
                setConfig({ ...defaultConfig, unidade_nome: empresa.nome, unidade_email: empresa.email });
            }
        } catch (error) {
            console.error('Erro ao carregar config:', error);
            setConfig({ ...defaultConfig, unidade_nome: empresa.nome, unidade_email: empresa.email });
        } finally {
            setLoadingConfig(false);
        }
    }

    // Salvar configuração
    async function handleSave() {
        if (!selectedEmpresa) return;

        setSaving(true);
        setMessage(null);

        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('supabase.auth.token');
            const response = await fetch(`/api/admin/empresas/${selectedEmpresa.id}/agente`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: `Configuração de ${selectedEmpresa.nome} salva!` });
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
        if (!selectedEmpresa) return;

        setSyncing(true);
        setMessage(null);

        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('supabase.auth.token');
            const response = await fetch(`/api/admin/empresas/${selectedEmpresa.id}/agente`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'sync' }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: `✅ Agente de ${selectedEmpresa.nome} sincronizado!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Erro ao sincronizar' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão' });
        } finally {
            setSyncing(false);
        }
    }

    // Filtrar empresas
    const filteredEmpresas = empresas.filter(emp =>
        emp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.schema.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Funções de gerenciamento de listas
    function addMembro() {
        if (novoMembro.nome && novoMembro.cargo) {
            setConfig(prev => ({ ...prev, equipe: [...prev.equipe, { ...novoMembro }] }));
            setNovoMembro({ nome: '', cargo: '' });
        }
    }

    function removeMembro(index: number) {
        setConfig(prev => ({ ...prev, equipe: prev.equipe.filter((_, i) => i !== index) }));
    }

    function addCurso() {
        if (novoCurso.nome) {
            setConfig(prev => ({ ...prev, cursos: [...prev.cursos, { ...novoCurso }] }));
            setNovoCurso({ nome: '', descricao: '', duracao: '' });
        }
    }

    function removeCurso(index: number) {
        setConfig(prev => ({ ...prev, cursos: prev.cursos.filter((_, i) => i !== index) }));
    }

    function addDiferencial() {
        if (novoDiferencial) {
            setConfig(prev => ({ ...prev, diferenciais: [...prev.diferenciais, novoDiferencial] }));
            setNovoDiferencial('');
        }
    }

    function addRegra() {
        if (novaRegra) {
            setConfig(prev => ({ ...prev, regras_negocio: [...prev.regras_negocio, novaRegra] }));
            setNovaRegra('');
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-white">Carregando empresas...</span>
                </div>
            </div>
        );
    }

    // Se nenhuma empresa selecionada, mostrar lista
    if (!selectedEmpresa) {
        return (
            <div className="min-h-screen bg-[#0a0a14] p-6">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
                            <Bot className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Gerenciar Agentes AI</h1>
                            <p className="text-gray-400">Configure o agente de cada cliente</p>
                        </div>
                    </div>

                    {/* Busca */}
                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#1a1a2e] border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                            placeholder="Buscar empresa..."
                        />
                    </div>

                    {/* Lista de Empresas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEmpresas.map((empresa) => (
                            <button
                                key={empresa.id}
                                onClick={() => loadConfig(empresa)}
                                className="p-6 rounded-xl bg-[#1a1a2e] border border-white/10 hover:border-purple-500/50 hover:bg-[#1e1e35] transition-all text-left group"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/30 to-blue-500/30 group-hover:from-purple-500/50 group-hover:to-blue-500/50 transition-colors">
                                        <Building2 className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">{empresa.nome}</h3>
                                        <p className="text-xs text-gray-500">{empresa.schema}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs px-2 py-1 rounded-full ${empresa.ativo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                        }`}>
                                        {empresa.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                    <span className="text-sm text-purple-400 group-hover:text-purple-300">
                                        Configurar →
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {filteredEmpresas.length === 0 && (
                        <div className="text-center py-12">
                            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400">Nenhuma empresa encontrada</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Editor de configuração
    return (
        <div className="min-h-screen bg-[#0a0a14] p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSelectedEmpresa(null)}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
                            <Bot className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Agente: {selectedEmpresa.nome}</h1>
                            <p className="text-gray-400">Schema: {selectedEmpresa.schema}</p>
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

                {/* Loading */}
                {loadingConfig && (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

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

                {!loadingConfig && (
                    <>
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
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Tom de Voz</label>
                                    <input
                                        type="text"
                                        value={config.tom_de_voz}
                                        onChange={(e) => setConfig(prev => ({ ...prev, tom_de_voz: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm text-gray-400 mb-1">Personalidade</label>
                                    <input
                                        type="text"
                                        value={config.agente_personalidade}
                                        onChange={(e) => setConfig(prev => ({ ...prev, agente_personalidade: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="usar_emojis_admin"
                                        checked={config.usar_emojis}
                                        onChange={(e) => setConfig(prev => ({ ...prev, usar_emojis: e.target.checked }))}
                                        className="w-4 h-4 rounded bg-black/30 border-white/10"
                                    />
                                    <label htmlFor="usar_emojis_admin" className="text-sm text-gray-300">Usar emojis</label>
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
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm text-gray-400 mb-1">Endereço Completo</label>
                                    <input
                                        type="text"
                                        value={config.unidade_endereco_completo}
                                        onChange={(e) => setConfig(prev => ({ ...prev, unidade_endereco_completo: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
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
                                        rows={2}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Estacionamento</label>
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
                        <Section title="Equipe" icon={<Users className="w-5 h-5 text-orange-400" />} defaultOpen={false}>
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
                                    <button onClick={addMembro} className="px-4 py-2 rounded-lg bg-purple-600 text-white">+</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {config.equipe.map((m, i) => (
                                        <span key={i} className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm text-white">
                                            {m.nome} ({m.cargo})
                                            <button onClick={() => removeMembro(i)} className="text-red-400">×</button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </Section>

                        {/* Seção: Produto/Serviço */}
                        <Section title="Produto / Serviço" icon={<Package className="w-5 h-5 text-pink-400" />}>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Nome do Produto</label>
                                    <input
                                        type="text"
                                        value={config.produto_nome}
                                        onChange={(e) => setConfig(prev => ({ ...prev, produto_nome: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Duração Média</label>
                                    <input
                                        type="text"
                                        value={config.produto_duracao_media}
                                        onChange={(e) => setConfig(prev => ({ ...prev, produto_duracao_media: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
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
                                    <label className="block text-sm text-gray-400 mb-2">Serviço Gratuito</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input
                                            type="text"
                                            value={config.servico_gratuito_nome}
                                            onChange={(e) => setConfig(prev => ({ ...prev, servico_gratuito_nome: e.target.value }))}
                                            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                            placeholder="Nome"
                                        />
                                        <input
                                            type="text"
                                            value={config.servico_gratuito_duracao}
                                            onChange={(e) => setConfig(prev => ({ ...prev, servico_gratuito_duracao: e.target.value }))}
                                            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                            placeholder="Duração"
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
                                        placeholder="Nome"
                                    />
                                    <input
                                        type="text"
                                        value={novoCurso.descricao}
                                        onChange={(e) => setNovoCurso(prev => ({ ...prev, descricao: e.target.value }))}
                                        className="px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                        placeholder="Descrição"
                                    />
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={novoCurso.duracao}
                                            onChange={(e) => setNovoCurso(prev => ({ ...prev, duracao: e.target.value }))}
                                            className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                            placeholder="Duração"
                                        />
                                        <button onClick={addCurso} className="px-4 py-2 rounded-lg bg-purple-600 text-white">+</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {config.cursos.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                                            <div>
                                                <span className="font-medium text-white">{c.nome}</span>
                                                <span className="text-gray-400 text-sm ml-2">- {c.descricao}</span>
                                                <span className="text-gray-500 text-sm ml-2">({c.duracao})</span>
                                            </div>
                                            <button onClick={() => removeCurso(i)} className="text-red-400">×</button>
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
                                    <label className="block text-sm text-gray-400 mb-1">Texto de Apresentação</label>
                                    <input
                                        type="text"
                                        value={config.preco_texto_apresentacao}
                                        onChange={(e) => setConfig(prev => ({ ...prev, preco_texto_apresentacao: e.target.value }))}
                                        className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                    />
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
                                        placeholder="Adicionar diferencial..."
                                    />
                                    <button onClick={addDiferencial} className="px-4 py-2 rounded-lg bg-purple-600 text-white">+</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {config.diferenciais.map((d, i) => (
                                        <span key={i} className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 text-sm text-yellow-400">
                                            ⭐ {d}
                                            <button onClick={() => setConfig(prev => ({ ...prev, diferenciais: prev.diferenciais.filter((_, idx) => idx !== i) }))} className="text-red-400">×</button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </Section>

                        {/* Seção: Regras */}
                        <Section title="Regras do Negócio" icon={<Settings className="w-5 h-5 text-red-400" />} defaultOpen={false}>
                            <div className="mt-4 space-y-4">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={novaRegra}
                                        onChange={(e) => setNovaRegra(e.target.value)}
                                        className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:border-purple-500 focus:outline-none"
                                        placeholder="Adicionar regra..."
                                    />
                                    <button onClick={addRegra} className="px-4 py-2 rounded-lg bg-purple-600 text-white">+</button>
                                </div>
                                <div className="space-y-2">
                                    {config.regras_negocio.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                            <span className="text-red-400">⚠️ {r}</span>
                                            <button onClick={() => setConfig(prev => ({ ...prev, regras_negocio: prev.regras_negocio.filter((_, idx) => idx !== i) }))} className="text-red-400">×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Section>

                        {/* Seção: Linguagem */}
                        <Section title="Linguagem" icon={<MessageSquare className="w-5 h-5 text-indigo-400" />} defaultOpen={false}>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Frases Proibidas</label>
                                    <div className="flex flex-wrap gap-2">
                                        {config.frases_proibidas.map((f, i) => (
                                            <span key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-xs text-red-400">
                                                {f}
                                                <button onClick={() => setConfig(prev => ({ ...prev, frases_proibidas: prev.frases_proibidas.filter((_, idx) => idx !== i) }))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Frases Permitidas</label>
                                    <div className="flex flex-wrap gap-2">
                                        {config.frases_permitidas.map((f, i) => (
                                            <span key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-xs text-green-400">
                                                {f}
                                                <button onClick={() => setConfig(prev => ({ ...prev, frases_permitidas: prev.frases_permitidas.filter((_, idx) => idx !== i) }))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Vocabulário Chave</label>
                                    <div className="flex flex-wrap gap-2">
                                        {config.vocabulario_chave.map((p, i) => (
                                            <span key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-xs text-purple-400">
                                                {p}
                                                <button onClick={() => setConfig(prev => ({ ...prev, vocabulario_chave: prev.vocabulario_chave.filter((_, idx) => idx !== i) }))}>×</button>
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
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold disabled:opacity-50"
                            >
                                {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Salvar
                            </button>
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold disabled:opacity-50"
                            >
                                {syncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                Sincronizar N8N
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

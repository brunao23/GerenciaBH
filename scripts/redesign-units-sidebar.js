const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'admin', '(panel)', 'units', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the start of return statement
const returnIdx = content.indexOf('\n    return (');
if (returnIdx < 0) { console.log('ERROR: return not found'); process.exit(1); }

// Find the closing of the component function (last }) 
// The return goes until the end of the function
const beforeReturn = content.substring(0, returnIdx);

// Find where the last } } is (closing of component)
// We'll replace from return to the end of the file
const endIdx = content.lastIndexOf('\n}');
const afterEnd = content.substring(endIdx + 2); // everything after }

const newJSX = `
    // ── Sidebar state ──
    const [sidebarSearch, setSidebarSearch] = useState("")
    const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
    const [activePanel, setActivePanel] = useState<{ unitId: string; panel: string } | null>(null)
    const [logsExpanded, setLogsExpanded] = useState(false)

    const filteredUnits = units.filter(u =>
        u.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        u.prefix.toLowerCase().includes(sidebarSearch.toLowerCase())
    )

    const activePanelUnit = activePanel ? units.find(u => u.id === activePanel.unitId) || null : null

    const handleSidebarPanelClick = (unit: Unit, panel: string) => {
        setActivePanel({ unitId: unit.id, panel })
        setExpandedUnit(unit.id)
        if (panel === 'n8n') openLinkDialog(unit)
        else if (panel === 'whatsapp') openMessagingDialog(unit)
        else if (panel === 'agente') openNativeAgentDialog(unit)
        else if (panel === 'kommo') openKommoDialog(unit)
        else if (panel === 'logs') openSystemLogsDialog(unit)
    }

    const activeUnits = units.filter(u => u.is_active).length
    const inactiveUnits = units.filter(u => !u.is_active).length

    return (
        <div className="flex h-screen overflow-hidden bg-[#080808]">
            {/* ═══ SIDEBAR ═══ */}
            <aside className={
                logsExpanded
                    ? "w-0 overflow-hidden transition-all duration-300"
                    : "w-72 flex-shrink-0 h-screen flex flex-col border-r border-[#1a1a1a] bg-[#0c0c0c] transition-all duration-300"
            }>
                {/* Sidebar Header */}
                <div className="p-5 border-b border-[#1a1a1a]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-semibold text-white">Unidades</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded font-mono border border-green-800/30">{activeUnits} ativas</span>
                            <button
                                onClick={() => setCreating(true)}
                                className="text-gray-600 hover:text-green-400 transition-colors"
                                title="Nova Unidade"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {/* Search */}
                    <div className="relative">
                        <input
                            value={sidebarSearch}
                            onChange={e => setSidebarSearch(e.target.value)}
                            placeholder="Buscar unidade..."
                            className="w-full bg-[#141414] border border-[#222] rounded-md px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-700 pr-8"
                        />
                        {sidebarSearch && (
                            <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white">
                                <XCircle className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Units List */}
                <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
                    {loading ? (
                        <div className="text-center py-8 text-gray-600 text-xs animate-pulse">Carregando...</div>
                    ) : filteredUnits.length === 0 ? (
                        <div className="text-center py-8 text-gray-700 text-xs">Nenhuma unidade encontrada</div>
                    ) : (
                        filteredUnits.map(unit => {
                            const isExpanded = expandedUnit === unit.id
                            const hasMessaging = Boolean(unit.metadata?.messaging?.provider)
                            const hasAgent = Boolean(unit.metadata?.nativeAgent?.enabled || unit.metadata?.aiAgent?.enabled)
                            const isActive = unit.is_active

                            return (
                                <div key={unit.id} className="mb-0.5">
                                    {/* Unit Row */}
                                    <button
                                        onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
                                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#141414] transition-colors group ${isExpanded ? 'bg-[#131313]' : ''}`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400' : 'bg-red-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{unit.name}</div>
                                            <div className="text-[10px] text-gray-600 font-mono truncate">{unit.prefix}</div>
                                        </div>
                                        <ChevronDown className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Unit Sub-menu */}
                                    {isExpanded && (
                                        <div className="bg-[#0a0a0a] border-l-2 border-green-900/40 ml-4">
                                            {/* Quick access */}
                                            <button
                                                onClick={() => handleAccessUnit(unit.prefix)}
                                                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-[#141414] transition-colors"
                                            >
                                                <ExternalLink className="w-3 h-3 text-green-500" />
                                                <span className="text-[11px] text-green-400 font-medium">Acessar Painel</span>
                                            </button>

                                            {[
                                                { id: 'n8n', icon: LinkIcon, label: 'Configurar N8N', color: 'text-orange-400' },
                                                { id: 'whatsapp', icon: MessageSquare, label: 'WhatsApp', color: 'text-green-400' },
                                                { id: 'agente', icon: Bot, label: 'Agente IA', color: 'text-purple-400' },
                                                { id: 'kommo', icon: RefreshCw, label: 'Kommo CRM', color: 'text-blue-400' },
                                                { id: 'logs', icon: FileText, label: 'Logs do Sistema', color: 'text-yellow-400' },
                                            ].map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleSidebarPanelClick(unit, item.id)}
                                                    className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-[#141414] transition-colors ${
                                                        activePanel?.unitId === unit.id && activePanel?.panel === item.id
                                                            ? 'bg-[#141414]'
                                                            : ''
                                                    }`}
                                                >
                                                    <item.icon className={`w-3 h-3 ${item.color} opacity-75`} />
                                                    <span className="text-[11px] text-gray-400 hover:text-gray-200">{item.label}</span>
                                                </button>
                                            ))}

                                            {/* Delete */}
                                            <button
                                                onClick={() => handleDelete(unit)}
                                                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-red-950/30 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3 text-red-700" />
                                                <span className="text-[11px] text-red-700 hover:text-red-500">Excluir Unidade</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Sidebar Footer */}
                <div className="p-4 border-t border-[#1a1a1a]">
                    <button
                        onClick={() => window.location.href = '/admin/workflows'}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-green-900/20 border border-green-900/40 hover:bg-green-900/30 transition-colors"
                    >
                        <Activity className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">N8N Manager</span>
                    </button>
                </div>
            </aside>

            {/* ═══ MAIN CONTENT ═══ */}
            <main className="flex-1 overflow-y-auto h-screen">

                {/* ── LOGS PANEL (full screen when expanded) ── */}
                {activePanel?.panel === 'logs' && activePanelUnit ? (
                    <div className="h-full flex flex-col bg-[#080808]">
                        {/* Logs Toolbar */}
                        <div className={`flex items-center gap-3 px-6 py-4 border-b border-[#1a1a1a] flex-shrink-0 ${logsExpanded ? 'bg-[#0c0c0c]' : ''}`}>
                            <div className="flex items-center gap-2 mr-2">
                                <FileText className="w-4 h-4 text-yellow-400" />
                                <div>
                                    <span className="text-sm font-semibold text-white">Logs do Sistema</span>
                                    <span className="text-xs text-gray-500 ml-2">— {activePanelUnit.name}</span>
                                </div>
                            </div>

                            {/* Filters */}
                            <select
                                value={systemLogsSeverityFilter}
                                onChange={e => setSystemLogsSeverityFilter(e.target.value)}
                                className="text-xs bg-[#141414] border border-[#222] rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-yellow-700"
                            >
                                <option value="all">Severidade: Todas</option>
                                <option value="error">Erros</option>
                                <option value="warn">Avisos</option>
                                <option value="success">Sucesso</option>
                                <option value="info">Info</option>
                            </select>

                            <select
                                value={systemLogsSourceFilter}
                                onChange={e => setSystemLogsSourceFilter(e.target.value)}
                                className="text-xs bg-[#141414] border border-[#222] rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-yellow-700"
                            >
                                <option value="all">Fonte: Todas</option>
                                <option value="native-agent">Agente IA</option>
                                <option value="webhook">Webhook</option>
                                <option value="followup">Follow-up</option>
                                <option value="scanner">Scanner</option>
                                <option value="system">Sistema</option>
                            </select>

                            <select
                                value={systemLogsLimit}
                                onChange={e => setSystemLogsLimit(Number(e.target.value))}
                                className="text-xs bg-[#141414] border border-[#222] rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-yellow-700"
                            >
                                <option value="50">50 linhas</option>
                                <option value="100">100 linhas</option>
                                <option value="200">200 linhas</option>
                                <option value="500">500 linhas</option>
                            </select>

                            <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-yellow-800/50 text-yellow-400 hover:bg-yellow-900/20"
                                onClick={refreshSystemLogs}
                                disabled={loadingSystemLogs}
                            >
                                <RefreshCw className={\`w-3 h-3 mr-1 \${loadingSystemLogs ? 'animate-spin' : ''}\`} />
                                {loadingSystemLogs ? 'Atualizando...' : 'Atualizar'}
                            </Button>

                            {/* Stats */}
                            {systemLogs.length > 0 && (
                                <div className="flex items-center gap-3 ml-2">
                                    {['error', 'warn', 'success', 'info'].map(sev => {
                                        const count = systemLogs.filter(l => l.severity === sev).length
                                        if (!count) return null
                                        const colors: Record<string, string> = { error: 'text-red-400', warn: 'text-yellow-400', success: 'text-green-400', info: 'text-blue-400' }
                                        const labels: Record<string, string> = { error: 'err', warn: 'warn', success: 'ok', info: 'info' }
                                        return <span key={sev} className={\`text-[11px] font-mono \${colors[sev]}\`}>{count} {labels[sev]}</span>
                                    })}
                                </div>
                            )}

                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[11px] text-gray-600">{systemLogs.length} registros</span>
                                <button
                                    onClick={() => setLogsExpanded(!logsExpanded)}
                                    title={logsExpanded ? 'Fechar tela cheia' : 'Expandir tela cheia'}
                                    className="text-gray-600 hover:text-yellow-400 transition-colors p-1.5 rounded hover:bg-yellow-900/20"
                                >
                                    {logsExpanded
                                        ? <span className="text-[10px]">⊠</span>
                                        : <span className="text-[10px]">⊡</span>}
                                </button>
                                <button
                                    onClick={() => { setActivePanel(null); setLogsExpanded(false) }}
                                    className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-900/20"
                                    title="Fechar logs"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Log entries */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs">
                            {loadingSystemLogs ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center text-gray-600">
                                        <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-yellow-800" />
                                        <p>Carregando logs...</p>
                                    </div>
                                </div>
                            ) : systemLogs.length === 0 ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center text-gray-700">
                                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                        <p className="text-sm font-medium text-gray-600">Nenhum log encontrado</p>
                                        <p className="text-xs text-gray-700 mt-1">Os logs aparecem conforme as interações ocorrem.</p>
                                    </div>
                                </div>
                            ) : (
                                systemLogs.map((log, idx) => {
                                    const SeverityIcon = getLogSeverityIcon(log.severity)
                                    const bgColors: Record<string, string> = {
                                        error: 'border-red-900/60 bg-red-950/20 hover:bg-red-950/30',
                                        warn: 'border-yellow-900/40 bg-yellow-950/10 hover:bg-yellow-950/20',
                                        success: 'border-green-900/40 bg-green-950/10 hover:bg-green-950/20',
                                        info: 'border-[#1e2a3a] bg-[#0e1525]/50 hover:bg-[#0e1525]',
                                    }
                                    const textColors: Record<string, string> = {
                                        error: 'text-red-400',
                                        warn: 'text-yellow-400',
                                        success: 'text-green-400',
                                        info: 'text-blue-400',
                                    }
                                    return (
                                        <div
                                            key={log.id || idx}
                                            className={\`rounded border px-3 py-2 \${bgColors[log.severity] || bgColors.info} transition-colors\`}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <SeverityIcon className={\`w-3.5 h-3.5 mt-0.5 flex-shrink-0 \${textColors[log.severity] || textColors.info}\`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-3 flex-wrap">
                                                        <span className={\`font-semibold \${textColors[log.severity] || textColors.info}\`}>
                                                            [{log.severity?.toUpperCase()}]
                                                        </span>
                                                        <span className="text-gray-200 truncate max-w-[400px]">{log.event || log.content}</span>
                                                        <span className="text-gray-600 text-[10px] ml-auto flex-shrink-0">
                                                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px]">
                                                        {log.source && <span className="text-gray-500">fonte: <span className="text-gray-400">{log.source}</span></span>}
                                                        {log.sessionId && <span className="text-gray-600">sessão: <span className="text-gray-500">{log.sessionId.slice(0, 24)}</span></span>}
                                                        {log.phone && <span className="text-gray-500">tel: <span className="text-gray-300">{log.phone}</span></span>}
                                                        {log.statusCode && (
                                                            <span className={log.statusCode >= 400 ? 'text-red-500' : 'text-green-500'}>
                                                                HTTP {log.statusCode}
                                                            </span>
                                                        )}
                                                        {log.duration && <span className="text-gray-600">⏱ {log.duration}ms</span>}
                                                    </div>
                                                    {log.error && (
                                                        <div className="mt-1.5 text-red-400 text-[10px] bg-red-950/40 rounded px-2 py-1 border border-red-900/30">
                                                            ✖ {log.error}
                                                        </div>
                                                    )}
                                                    {log.content && log.content !== log.event && (
                                                        <div className="mt-1 text-gray-500 text-[10px]">{log.content}</div>
                                                    )}
                                                    {log.details && Object.keys(log.details).length > 0 && (
                                                        <details className="mt-1.5">
                                                            <summary className="cursor-pointer text-[10px] text-gray-700 hover:text-gray-500 select-none">
                                                                ▸ {Object.keys(log.details).length} campos adicionais
                                                            </summary>
                                                            <pre className="text-[9px] text-gray-600 mt-1 overflow-x-auto max-h-40 bg-black/40 rounded p-2 border border-[#1a1a1a]">
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                ) : (
                    /* ── DEFAULT DASHBOARD ── */
                    <div className="p-6 space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-semibold text-white tracking-tight">Painel de Unidades</h1>
                                <p className="text-gray-600 text-sm mt-0.5">Visão geral do sistema SaaS — {units.length} unidades</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                        <span className="text-gray-400">{activeUnits} ativas</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-gray-400">{inactiveUnits} inativas</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Broadcast Card */}
                        <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Megaphone className="w-4 h-4 text-green-400" />
                                <h3 className="text-sm font-semibold text-white">Aviso para Clientes</h3>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                                <Select value={broadcastTarget} onValueChange={setBroadcastTarget}>
                                    <SelectTrigger className="bg-[#141414] border-[#222] text-gray-300 h-9 text-xs">
                                        <SelectValue placeholder="Destino" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#141414] border-[#222] text-white">
                                        <SelectItem value="all">Todas as unidades ativas</SelectItem>
                                        {units.filter(u => u.is_active).map(u => (
                                            <SelectItem key={u.id} value={u.prefix}>{u.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={broadcastTitle}
                                    onChange={e => setBroadcastTitle(e.target.value)}
                                    placeholder="Título do aviso"
                                    className="bg-[#141414] border-[#222] text-white h-9 text-xs lg:col-span-2"
                                    maxLength={140}
                                />
                                <Button
                                    onClick={handleBroadcast}
                                    disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastMessage.trim()}
                                    className="bg-green-500 hover:bg-green-600 text-black font-semibold text-xs h-9"
                                >
                                    {sendingBroadcast ? 'Enviando...' : 'Enviar Aviso'}
                                </Button>
                            </div>
                            <Textarea
                                value={broadcastMessage}
                                onChange={e => setBroadcastMessage(e.target.value)}
                                placeholder="Mensagem do aviso para os clientes..."
                                className="mt-3 min-h-[80px] bg-[#141414] border-[#222] text-white text-xs resize-none"
                                maxLength={800}
                            />
                        </div>

                        {/* Units Grid */}
                        <div className="space-y-2">
                            <p className="text-xs text-gray-600 uppercase tracking-wider font-medium">Clique em uma unidade na barra lateral para configurar</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-5 animate-pulse">
                                            <div className="h-4 bg-[#1a1a1a] rounded w-3/4 mb-2" />
                                            <div className="h-3 bg-[#1a1a1a] rounded w-1/2" />
                                        </div>
                                    ))
                                ) : units.map(unit => {
                                    const hasMessaging = Boolean(unit.metadata?.messaging?.provider)
                                    const hasAgent = Boolean(unit.metadata?.nativeAgent?.enabled || unit.metadata?.aiAgent?.enabled)
                                    return (
                                        <div
                                            key={unit.id}
                                            className="bg-[#0d0d0d] border border-[#1a1a1a] hover:border-green-900/50 rounded-xl p-5 transition-all group cursor-pointer"
                                            onClick={() => {
                                                setExpandedUnit(unit.id)
                                                const el = document.getElementById(\`sidebar-unit-\${unit.id}\`)
                                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                            }}
                                        >
                                            <div className="flex items-start gap-3 mb-4">
                                                <div className="w-9 h-9 rounded-lg bg-green-900/20 border border-green-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-green-900/30 transition-colors">
                                                    <Database className="w-4 h-4 text-green-500" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-semibold text-white truncate">{unit.name}</h3>
                                                    <p className="text-[10px] text-gray-600 font-mono truncate">{unit.prefix}</p>
                                                </div>
                                                <div className={\`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 \${unit.is_active ? 'bg-green-400' : 'bg-red-500'}\`} />
                                            </div>

                                            <div className="flex gap-2 flex-wrap">
                                                {hasMessaging && (
                                                    <span className="text-[10px] text-green-400 bg-green-900/20 border border-green-900/30 px-1.5 py-0.5 rounded font-mono">
                                                        WhatsApp ✓
                                                    </span>
                                                )}
                                                {hasAgent && (
                                                    <span className="text-[10px] text-purple-400 bg-purple-900/20 border border-purple-900/30 px-1.5 py-0.5 rounded font-mono">
                                                        IA ✓
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-[#1a1a1a] flex gap-2 flex-wrap">
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleSidebarPanelClick(unit, 'logs') }}
                                                    className="text-[11px] text-yellow-600 hover:text-yellow-400 flex items-center gap-1 transition-colors"
                                                >
                                                    <FileText className="w-3 h-3" /> Logs
                                                </button>
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleAccessUnit(unit.prefix) }}
                                                    className="text-[11px] text-green-600 hover:text-green-400 flex items-center gap-1 transition-colors ml-auto"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Acessar
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* ═══ ALL EXISTING DIALOGS ═══ */}
            {/* Dialog de criacao de unidade */}
            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-green-500 flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Nova Unidade
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Criação automatizada de infraestrutura (Banco + N8N).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome da Unidade</Label>
                            <Input
                                required
                                placeholder="Ex: Vox Rio de Janeiro"
                                value={newName}
                                onChange={e => handleNameChange(e.target.value)}
                                className="bg-secondary border-border text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Prefixo (slug)</Label>
                            <Input
                                required
                                placeholder="vox_rio_de_janeiro"
                                value={newPrefix}
                                onChange={e => setNewPrefix(e.target.value)}
                                className="bg-secondary border-border text-white font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500">Identificador único. Apenas letras, números e _.</p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-green-400 text-black hover:bg-green-500" disabled={!newName || !newPrefix}>
                                Criar Unidade
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* N8N Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border text-white">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Integração N8N</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Vincular workflows para <strong>{selectedUnit?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Fluxo Principal (Z-API)</Label>
                            <Select onValueChange={setSelectedWorkflowId} value={selectedWorkflowId}>
                                <SelectTrigger className="bg-secondary border-border">
                                    <SelectValue placeholder="Selecionar workflow..." />
                                </SelectTrigger>
                                <SelectContent className="bg-secondary border-border text-white">
                                    {loadingWorkflows && <SelectItem value="loading" disabled>Carregando...</SelectItem>}
                                    {workflows.map(w => (
                                        <SelectItem key={w.id} value={w.id}>
                                            {w.name || w.id} {w.active ? '(ativo)' : '(inativo)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-green-400 text-black" onClick={handleLinkWorkflow} disabled={linking || !selectedWorkflowId}>
                            {linking ? 'Vinculando...' : 'Vincular Workflow'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-card border-red-900/50 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Confirmar Exclusão</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Isso removerá todo banco de dados e conexões da unidade <strong>{unitToDelete?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" className="bg-red-600" onClick={confirmDelete} disabled={deleting}>
                            {deleting ? 'Excluindo...' : 'Excluir Definitivamente'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
`;

// Replace everything from the start of computed values before return to end of file
// Find "    const activeUnits" line
const activeUnitsIdx = content.indexOf('\n    const activeUnits = units.filter');
if (activeUnitsIdx < 0) { console.log('ERROR: activeUnits not found'); process.exit(1); }

const newContent = beforeReturn + '\n' + newJSX;

// We need to write beforeReturn (up to end of last function before return)
// then add the new sidebar state + return JSX
const finalContent = content.substring(0, activeUnitsIdx) + newJSX;

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log('SUCCESS: Sidebar layout applied. Lines:', finalContent.split('\n').length);

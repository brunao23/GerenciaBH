const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'admin', '(panel)', 'units', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add FileText icon import
content = content.replace(
  'import {\n    Plus,\n    Database,\n    Server,\n    ExternalLink,\n    Activity,\n    Link as LinkIcon,\n    Trash2,\n    MessageSquare,\n    Megaphone,\n    Bot,\n    RefreshCw,\n    MapPin,\n} from "lucide-react"',
  'import {\n    Plus,\n    Database,\n    Server,\n    ExternalLink,\n    Activity,\n    Link as LinkIcon,\n    Trash2,\n    MessageSquare,\n    Megaphone,\n    Bot,\n    RefreshCw,\n    MapPin,\n    FileText,\n    AlertTriangle,\n    CheckCircle2,\n    XCircle,\n    Info,\n    Filter,\n    ChevronDown,\n} from "lucide-react"'
);

// 2. Add SystemLogItem interface after NativeAgentDebugItem interface
const afterInterface = `interface NativeAgentDebugItem {
    id: string
    sessionId: string
    createdAt: string
    event: string
    severity: "info" | "error"
    content: string
    source: string
    error?: string
}`;

const systemLogInterface = `interface NativeAgentDebugItem {
    id: string
    sessionId: string
    createdAt: string
    event: string
    severity: "info" | "error"
    content: string
    source: string
    error?: string
}

interface SystemLogItem {
    id: string
    sessionId: string
    createdAt: string
    event: string
    severity: "info" | "warn" | "error" | "success"
    content: string
    source: string
    statusCode?: number
    duration?: number
    phone?: string
    error?: string
    details?: Record<string, any>
}`;

content = content.replace(afterInterface, systemLogInterface);

// 3. Add state variables after kommoLastSyncStatus state
const afterKommoLastSyncStatus = `    const [kommoLastSync, setKommoLastSync] = useState("")
    const [kommoLastSyncStatus, setKommoLastSyncStatus] = useState("")`;

const withSystemLogsState = `    const [kommoLastSync, setKommoLastSync] = useState("")
    const [kommoLastSyncStatus, setKommoLastSyncStatus] = useState("")

    // System Logs State
    const [systemLogsDialogOpen, setSystemLogsDialogOpen] = useState(false)
    const [systemLogsUnit, setSystemLogsUnit] = useState<Unit | null>(null)
    const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>([])
    const [loadingSystemLogs, setLoadingSystemLogs] = useState(false)
    const [systemLogsSeverityFilter, setSystemLogsSeverityFilter] = useState("all")
    const [systemLogsSourceFilter, setSystemLogsSourceFilter] = useState("all")
    const [systemLogsLimit, setSystemLogsLimit] = useState(100)`;

content = content.replace(afterKommoLastSyncStatus, withSystemLogsState);

// 4. Add fetchSystemLogs function after handleDelete
const afterHandleDelete = `    const handleDelete = (unit: Unit) => {
        setUnitToDelete(unit)
        setDeleteDialogOpen(true)
    }`;

const withFetchSystemLogs = `    const handleDelete = (unit: Unit) => {
        setUnitToDelete(unit)
        setDeleteDialogOpen(true)
    }

    const fetchSystemLogs = async (unitRef: string, opts?: { severity?: string; source?: string; limit?: number }) => {
        setLoadingSystemLogs(true)
        try {
            const params = new URLSearchParams()
            params.set("limit", String(opts?.limit || systemLogsLimit))
            if (opts?.severity && opts.severity !== "all") params.set("severity", opts.severity)
            if (opts?.source && opts.source !== "all") params.set("source", opts.source)
            const res = await fetch(\`/api/admin/units/\${encodeURIComponent(unitRef)}/system-logs?\${params.toString()}\`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Erro ao carregar logs")
            setSystemLogs(Array.isArray(data.items) ? data.items : [])
        } catch (error: any) {
            setSystemLogs([])
            toast.error(error?.message || "Erro ao carregar logs do sistema")
        } finally {
            setLoadingSystemLogs(false)
        }
    }

    const openSystemLogsDialog = async (unit: Unit) => {
        setSystemLogsUnit(unit)
        setSystemLogsSeverityFilter("all")
        setSystemLogsSourceFilter("all")
        setSystemLogsLimit(100)
        setSystemLogsDialogOpen(true)
        const unitRef = String(unit.prefix || unit.id || "").trim()
        if (unitRef) await fetchSystemLogs(unitRef)
    }

    const refreshSystemLogs = async () => {
        if (!systemLogsUnit) return
        const unitRef = String(systemLogsUnit.prefix || systemLogsUnit.id || "").trim()
        if (!unitRef) return
        await fetchSystemLogs(unitRef, {
            severity: systemLogsSeverityFilter,
            source: systemLogsSourceFilter,
            limit: systemLogsLimit,
        })
    }

    const getLogSeverityStyle = (severity: string) => {
        switch (severity) {
            case "error": return "text-red-400 bg-red-900/20 border-red-800/50"
            case "warn": return "text-yellow-400 bg-yellow-900/20 border-yellow-800/50"
            case "success": return "text-green-400 bg-green-900/20 border-green-800/50"
            default: return "text-blue-400 bg-blue-900/20 border-blue-800/50"
        }
    }

    const getLogSeverityIcon = (severity: string) => {
        switch (severity) {
            case "error": return XCircle
            case "warn": return AlertTriangle
            case "success": return CheckCircle2
            default: return Info
        }
    }`;

content = content.replace(afterHandleDelete, withFetchSystemLogs);

// 5. Add the "Logs do Sistema" button in the unit card actions
const actionButtons = `                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(unit) }}
                                        className="text-gray-600 hover:text-red-500 text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" /> Excluir
                                    </button>`;

const actionButtonsWithLogs = `                                    <button
                                        onClick={(e) => { e.stopPropagation(); openSystemLogsDialog(unit) }}
                                        className="text-gray-600 hover:text-blue-400 text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <FileText className="w-3 h-3" /> Logs do Sistema
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(unit) }}
                                        className="text-gray-600 hover:text-red-500 text-xs flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" /> Excluir
                                    </button>`;

content = content.replace(actionButtons, actionButtonsWithLogs);

// 6. Add the System Logs Dialog before the delete dialog
const deleteDialog = `            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>`;

const systemLogsDialogAndDelete = `            {/* DIALOG DE LOGS DO SISTEMA */}
            <Dialog open={systemLogsDialogOpen} onOpenChange={setSystemLogsDialogOpen}>
                <DialogContent className="bg-[#0a0a0a] border-border text-white max-w-5xl max-h-[90vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="text-blue-400 flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            Logs do Sistema — {systemLogsUnit?.name || systemLogsUnit?.prefix}
                        </DialogTitle>
                        <DialogDescription className="text-gray-500">
                            Registros de requisições, erros, ações do agente IA e eventos do sistema para esta unidade.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center py-3 border-b border-border flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Filter className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-500">Filtros:</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Severidade:</span>
                            <select
                                value={systemLogsSeverityFilter}
                                onChange={(e) => setSystemLogsSeverityFilter(e.target.value)}
                                className="text-xs bg-secondary border border-border rounded px-2 py-1 text-white"
                            >
                                <option value="all">Todos</option>
                                <option value="error">Erros</option>
                                <option value="warn">Avisos</option>
                                <option value="success">Sucesso</option>
                                <option value="info">Info</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Fonte:</span>
                            <select
                                value={systemLogsSourceFilter}
                                onChange={(e) => setSystemLogsSourceFilter(e.target.value)}
                                className="text-xs bg-secondary border border-border rounded px-2 py-1 text-white"
                            >
                                <option value="all">Todas</option>
                                <option value="native-agent">Agente IA</option>
                                <option value="webhook">Webhook</option>
                                <option value="followup">Follow-up</option>
                                <option value="scanner">Scanner</option>
                                <option value="system">Sistema</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Linhas:</span>
                            <select
                                value={systemLogsLimit}
                                onChange={(e) => setSystemLogsLimit(Number(e.target.value))}
                                className="text-xs bg-secondary border border-border rounded px-2 py-1 text-white"
                            >
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="200">200</option>
                                <option value="500">500</option>
                            </select>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-blue-800 text-blue-400 hover:bg-blue-900/30 ml-auto"
                            onClick={refreshSystemLogs}
                            disabled={loadingSystemLogs}
                        >
                            <RefreshCw className={\`w-3 h-3 mr-1 \${loadingSystemLogs ? "animate-spin" : ""}\`} />
                            {loadingSystemLogs ? "Carregando..." : "Atualizar"}
                        </Button>
                    </div>

                    {/* Log Summary */}
                    {systemLogs.length > 0 && (
                        <div className="flex gap-4 py-2 px-1 flex-shrink-0">
                            {["error", "warn", "success", "info"].map((sev) => {
                                const count = systemLogs.filter(l => l.severity === sev).length
                                if (!count) return null
                                const colors: Record<string, string> = {
                                    error: "text-red-400",
                                    warn: "text-yellow-400",
                                    success: "text-green-400",
                                    info: "text-blue-400",
                                }
                                const labels: Record<string, string> = {
                                    error: "Erros",
                                    warn: "Avisos",
                                    success: "Sucesso",
                                    info: "Info",
                                }
                                return (
                                    <span key={sev} className={\`text-xs font-medium \${colors[sev]}\`}>
                                        {count} {labels[sev]}
                                    </span>
                                )
                            })}
                        </div>
                    )}

                    {/* Log List */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
                        {loadingSystemLogs ? (
                            <div className="text-center py-12 text-gray-500 animate-pulse text-sm">
                                Carregando logs do sistema...
                            </div>
                        ) : systemLogs.length === 0 ? (
                            <div className="text-center py-12 text-gray-600 text-sm flex flex-col items-center gap-3">
                                <FileText className="w-10 h-10 text-gray-700" />
                                <div>
                                    <p className="font-medium text-gray-500">Nenhum log encontrado</p>
                                    <p className="text-xs text-gray-600 mt-1">Os logs aparecem conforme as interações acontecem.</p>
                                </div>
                            </div>
                        ) : (
                            systemLogs.map((log) => {
                                const SeverityIcon = getLogSeverityIcon(log.severity)
                                const severityStyle = getLogSeverityStyle(log.severity)
                                return (
                                    <div
                                        key={log.id}
                                        className={\`rounded-md border px-3 py-2 font-mono text-xs \${severityStyle}\`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <SeverityIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                                                    <span className="font-semibold truncate max-w-[280px]">{log.event || log.content}</span>
                                                    <span className="text-gray-500 text-[10px] ml-auto flex-shrink-0">
                                                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                                                    {log.source && <span>fonte: <span className="text-gray-300">{log.source}</span></span>}
                                                    {log.sessionId && <span>sessão: <span className="text-gray-300">{log.sessionId.slice(0, 20)}</span></span>}
                                                    {log.phone && <span>tel: <span className="text-gray-300">{log.phone}</span></span>}
                                                    {log.statusCode && (
                                                        <span className={log.statusCode >= 400 ? "text-red-400" : "text-green-400"}>
                                                            HTTP {log.statusCode}
                                                        </span>
                                                    )}
                                                    {log.duration && <span>⏱ {log.duration}ms</span>}
                                                </div>
                                                {log.error && (
                                                    <div className="mt-1 text-red-400 text-[10px] bg-red-950/40 rounded px-2 py-1 border border-red-900/30">
                                                        {log.error}
                                                    </div>
                                                )}
                                                {log.content && log.content !== log.event && (
                                                    <div className="mt-1 text-gray-400 text-[10px] truncate">{log.content}</div>
                                                )}
                                                {log.details && Object.keys(log.details).length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-[10px] text-gray-600 hover:text-gray-400">
                                                            Ver detalhes ({Object.keys(log.details).length} campos)
                                                        </summary>
                                                        <pre className="text-[9px] text-gray-500 mt-1 overflow-x-auto max-h-32 bg-black/30 rounded p-1.5">
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

                    <DialogFooter className="flex-shrink-0 pt-3 border-t border-border">
                        <span className="text-xs text-gray-600 mr-auto">
                            {systemLogs.length} registro(s) exibido(s)
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSystemLogsDialogOpen(false)}
                            className="text-gray-400"
                        >
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>`;

content = content.replace(deleteDialog, systemLogsDialogAndDelete);

fs.writeFileSync(filePath, content, 'utf8');
console.log('SUCCESS: System Logs dialog added to admin/units page');

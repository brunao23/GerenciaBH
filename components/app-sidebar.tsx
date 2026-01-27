"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarRail,
} from "@/components/ui/sidebar"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  MessageCircle,
  Calendar,
  Zap,
  Workflow,
  PauseCircle,
  FileText,
  LayoutTemplate,
  LogOut,
  Users,
  Building2,
  Bot,
  Shield,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const items = [
  { title: "Dashboard", url: "/", icon: BarChart3 },
  { title: "CRM", url: "/crm", icon: LayoutTemplate },
  { title: "Agente IA", url: "/configuracoes/agente", icon: Bot }, // NOVO: Configuração do Agente
  { title: "Conversas", url: "/conversas", icon: MessageCircle },
  { title: "Agendamentos", url: "/agendamentos", icon: Calendar },
  { title: "Follow-ups", url: "/followups", icon: Workflow },
  { title: "Pausas", url: "/pausas", icon: PauseCircle },
  { title: "Relatórios", url: "/relatorios", icon: FileText },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [sessionData, setSessionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Buscar sessão
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setSessionData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Erro ao buscar sessão:', err)
        setLoading(false)
      })
  }, [])

  // Verifica se é admin - DEVE VIR ANTES de handleLogout!
  const isAdmin = sessionData?.session?.isAdmin || sessionData?.role === 'admin' || sessionData?.email === 'admin@geniallabs.com.br'

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })

      // Se é admin, redirecionar para login de admin
      // Se é usuário normal, redirecionar para login de usuário
      const loginUrl = isAdmin ? '/admin/login' : '/login'

      console.log('[AppSidebar] Logout - isAdmin:', isAdmin, 'loginUrl:', loginUrl)

      // Usar window.location.href para forçar navegação completa
      window.location.href = loginUrl
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  const handleSwitchClient = () => {
    router.push('/admin/switch-client')
  }

  return (
    <Sidebar className="bg-[var(--card-black)] border-[var(--border-gray)] backdrop-blur-sm">
      <SidebarHeader className="px-4 py-6 border-b border-[var(--border-gray)]">
        <div className="flex items-center gap-4 px-2">
          <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent-yellow)] to-[var(--dark-yellow)] rounded-2xl flex items-center justify-center shadow-lg shadow-[var(--accent-yellow)]/30 animate-pulse">
            <Zap className="h-6 w-6 text-[var(--primary-black)] font-bold" />
          </div>
          <div className="flex-1">
            <span className="font-bold text-[var(--pure-white)] text-lg tracking-wide">GerencIA</span>
            <div className="text-xs text-[var(--text-gray)] uppercase tracking-[0.2em] font-light">
              By CORE LION AI
            </div>
          </div>
        </div>

        {/* Nome da Unidade - BEM VISÍVEL */}
        {!loading && sessionData?.session?.unitName && (
          <div className="mt-4 px-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--dark-green)]/10 border border-[var(--accent-green)]/30">
              <Building2 className="w-5 h-5 text-[var(--accent-green)]" />
              <div className="flex-1">
                <div className="text-xs text-[var(--text-gray)] uppercase tracking-wider">Unidade Ativa</div>
                <div className="font-semibold text-[var(--accent-green)] text-sm">{sessionData.session.unitName}</div>
              </div>
            </div>
          </div>
        )}

        {/* Botão Trocar de Cliente - SEMPRE VISÍVEL para admin */}
        {!loading && isAdmin && (
          <div className="mt-3 px-2 space-y-2">
            <Link href="/admin/agentes">
              <div className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-purple-900/10 border border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 group cursor-pointer">
                <Shield className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform duration-300" />
                <div className="flex-1 text-left">
                  <span className="font-medium text-[var(--pure-white)] text-xs">Painel Master</span>
                </div>
              </div>
            </Link>
            <button
              onClick={handleSwitchClient}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-gradient-to-r from-[var(--accent-yellow)]/20 to-[var(--dark-yellow)]/10 border border-[var(--accent-yellow)]/30 hover:border-[var(--accent-yellow)]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-yellow)]/20 group"
            >
              <Users className="w-4 h-4 text-[var(--accent-yellow)] group-hover:scale-110 transition-transform duration-300" />
              <div className="flex-1 text-left">
                <span className="font-medium text-[var(--pure-white)] text-xs">Trocar de Cliente</span>
              </div>
            </button>
          </div>
        )}
      </SidebarHeader>
      <SidebarSeparator className="bg-gradient-to-r from-transparent via-[var(--border-gray)] to-transparent" />
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[var(--text-gray)] text-xs uppercase tracking-[0.15em] font-medium px-4 py-3">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {items.map((item) => {
                const active = pathname === item.url || (item.url !== "/" && pathname?.startsWith(item.url))
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={`
                        h-12 px-4 rounded-xl transition-all duration-300 ease-in-out
                        hover:bg-[var(--hover-gray)] hover:shadow-lg hover:shadow-[var(--accent-green)]/10
                        hover:border-l-2 hover:border-[var(--accent-green)]/50
                        ${active
                          ? "bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--dark-green)]/10 border-l-4 border-[var(--accent-green)] text-[var(--accent-green)] shadow-lg shadow-[var(--accent-green)]/20"
                          : "text-[var(--text-gray)] hover:text-[var(--pure-white)]"
                        }
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-4 w-full">
                        <Icon
                          className={`h-5 w-5 transition-all duration-300 ${active
                            ? "text-[var(--accent-green)] drop-shadow-[0_0_8px_var(--accent-green)]"
                            : "group-hover:text-[var(--pure-white)]"
                            }`}
                        />
                        <span className="font-medium text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-6 border-t border-[var(--border-gray)]">
        <div className="space-y-3">
          {/* Botão Trocar de Cliente (apenas admin) */}
          {!loading && isAdmin && (
            <button
              onClick={handleSwitchClient}
              className="flex items-center gap-3 w-full p-3 rounded-lg bg-gradient-to-r from-[var(--accent-blue)]/20 to-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 hover:border-[var(--accent-blue)]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/20 group"
            >
              <Users className="w-5 h-5 text-[var(--accent-blue)] group-hover:scale-110 transition-transform duration-300" />
              <div className="flex-1 text-left">
                <span className="font-medium text-[var(--pure-white)] text-sm">Trocar de Cliente</span>
                <div className="text-xs text-[var(--text-gray)]">Modo Admin</div>
              </div>
            </button>
          )}

          {/* Botão Sair */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full p-3 rounded-lg bg-gradient-to-r from-[var(--accent-red)]/20 to-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 hover:border-[var(--accent-red)]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-red)]/20 group"
          >
            <LogOut className="w-5 h-5 text-[var(--accent-red)] group-hover:scale-110 transition-transform duration-300" />
            <div className="flex-1 text-left">
              <span className="font-medium text-[var(--pure-white)] text-sm">Sair</span>
              <div className="text-xs text-[var(--text-gray)]">
                {loading ? 'Carregando...' : (sessionData?.email || 'Desconectar')}
              </div>
            </div>
          </button>

          {/* Status Dashboard */}
          <div className="text-xs text-[var(--text-gray)] px-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--secondary-black)] border border-[var(--border-gray)]">
              <div className="relative">
                <div className="w-3 h-3 bg-[var(--accent-green)] rounded-full animate-pulse shadow-lg shadow-[var(--accent-green)]/50"></div>
                <div className="absolute inset-0 w-3 h-3 bg-[var(--accent-green)] rounded-full animate-ping opacity-30"></div>
              </div>
              <span className="font-medium">Dashboard Operacional</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

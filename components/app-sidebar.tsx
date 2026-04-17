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
  Megaphone,
  FileText,
  LayoutTemplate,
  LogOut,
  Users,
  Building2,
  Bot,
  ShieldCheck,
  Bell,
  BookUser,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const items = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "CRM", url: "/crm", icon: LayoutTemplate },
  { title: "Conversas", url: "/conversas", icon: MessageCircle },
  { title: "Contatos", url: "/conversas?tab=contatos", icon: BookUser },
  { title: "Agendamentos", url: "/agendamentos", icon: Calendar },
  { title: "Lembretes", url: "/lembretes", icon: Bell },
  { title: "Follow-ups", url: "/followups", icon: Workflow },
  { title: "Pausas", url: "/pausas", icon: PauseCircle },
  { title: "Disparos", url: "/disparos", icon: Megaphone },
  { title: "Configuracao", url: "/configuracao", icon: ShieldCheck },
  { title: "Agente IA", url: "/agente-ia", icon: Bot },
  { title: "Relatorios", url: "/relatorios", icon: FileText },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [sessionData, setSessionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

  const isAdmin = sessionData?.session?.isAdmin || sessionData?.role === 'admin' || sessionData?.email === 'admin@geniallabs.com.br'

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      const loginUrl = isAdmin ? '/admin/login' : '/login'
      window.location.href = loginUrl
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  const handleSwitchClient = () => {
    router.push('/admin/switch-client')
  }

  return (
    <Sidebar className="bg-sidebar border-sidebar-border">
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent-green)] to-[var(--dark-green)] rounded-xl flex items-center justify-center shadow-md shadow-[var(--accent-green)]/20">
            <Zap className="h-5 w-5 text-white font-bold" />
          </div>
          <div className="flex-1">
            <span className="font-bold text-foreground text-lg tracking-tight">GerencIA</span>
            <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
              Genial Labs AI
            </div>
          </div>
        </div>

        {/* Nome da Unidade */}
        {!loading && sessionData?.session?.unitName && (
          <div className="mt-3 px-2">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--accent-green)]/8 border border-[var(--accent-green)]/15">
              <Building2 className="w-4 h-4 text-[var(--accent-green)]" />
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unidade Ativa</div>
                <div className="font-semibold text-[var(--accent-green)] text-sm">{sessionData.session.unitName}</div>
              </div>
            </div>
          </div>
        )}

        {/* Botão Trocar de Cliente — admin */}
        {!loading && isAdmin && (
          <div className="mt-2 px-2">
            <button
              onClick={handleSwitchClient}
              className="flex items-center gap-2 w-full p-2 rounded-lg bg-[var(--accent-green)]/6 border border-[var(--accent-green)]/12 hover:border-[var(--accent-green)]/25 transition-all duration-200 group"
            >
              <Users className="w-4 h-4 text-[var(--accent-green)] group-hover:scale-105 transition-transform duration-200" />
              <span className="font-medium text-foreground text-xs">Trocar de Cliente</span>
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarSeparator className="bg-sidebar-border" />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground text-[10px] uppercase tracking-[0.15em] font-semibold px-4 py-3">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
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
                        h-10 px-3 rounded-lg transition-all duration-200
                        hover:bg-[var(--accent-green)]/8
                        ${active
                          ? "bg-[var(--accent-green)]/10 border-l-[3px] border-[var(--accent-green)] text-[var(--accent-green)] font-medium"
                          : "text-muted-foreground hover:text-foreground border-l-[3px] border-transparent"
                        }
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full">
                        <Icon
                          className={`h-[18px] w-[18px] transition-colors duration-200 ${
                            active ? "text-[var(--accent-green)]" : ""
                          }`}
                        />
                        <span className="text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4 border-t border-sidebar-border">
        <div className="space-y-2">
          {/* Trocar de Cliente — admin (footer) */}
          {!loading && isAdmin && (
            <button
              onClick={handleSwitchClient}
              className="flex items-center gap-2.5 w-full p-2.5 rounded-lg bg-[var(--accent-blue)]/8 border border-[var(--accent-blue)]/15 hover:border-[var(--accent-blue)]/30 transition-all duration-200 group"
            >
              <Users className="w-4 h-4 text-[var(--accent-blue)] group-hover:scale-105 transition-transform duration-200" />
              <div className="flex-1 text-left">
                <span className="font-medium text-foreground text-xs">Trocar de Cliente</span>
                <div className="text-[10px] text-muted-foreground">Modo Admin</div>
              </div>
            </button>
          )}

          {/* Botão Sair */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full p-2.5 rounded-lg bg-[var(--accent-red)]/8 border border-[var(--accent-red)]/15 hover:border-[var(--accent-red)]/30 transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 text-[var(--accent-red)] group-hover:scale-105 transition-transform duration-200" />
            <div className="flex-1 text-left">
              <span className="font-medium text-foreground text-xs">Sair</span>
              <div className="text-[10px] text-muted-foreground">
                {loading ? 'Carregando...' : (sessionData?.email || 'Desconectar')}
              </div>
            </div>
          </button>

          {/* Status */}
          <div className="text-muted-foreground px-1">
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary border border-border">
              <div className="relative">
                <div className="w-2 h-2 bg-[var(--accent-green)] rounded-full shadow-sm shadow-[var(--accent-green)]/40"></div>
                <div className="absolute inset-0 w-2 h-2 bg-[var(--accent-green)] rounded-full animate-ping opacity-20"></div>
              </div>
              <span className="font-medium text-xs">Operacional</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

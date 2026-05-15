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
  useSidebar,
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
  LayoutTemplate,
  LogOut,
  Building2,
  Bot,
  ShieldCheck,
  Bell,
  BookUser,
  Users,
  Instagram,
  Heart,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useTenant } from "@/lib/contexts/TenantContext"

const items = [
  { title: "Visão Geral", url: "/dashboard", icon: BarChart3 },
  { title: "Pipeline", url: "/crm", icon: LayoutTemplate },
  { title: "Conversas", url: "/conversas", icon: MessageCircle },
  { title: "Contatos", url: "/contatos", icon: BookUser },
  { title: "Agenda", url: "/agendamentos", icon: Calendar },
  { title: "Lembretes", url: "/lembretes", icon: Bell },
  { title: "Follow-ups", url: "/followups", icon: Workflow },
  { title: "Pausas", url: "/pausas", icon: PauseCircle },
  { title: "Campanhas", url: "/disparos", icon: Megaphone },
  { title: "Configurações", url: "/configuracao", icon: ShieldCheck },
]

const agentesItems = [
  { title: "Agente de Matrículas WhatsApp", slug: "whatsapp", icon: MessageCircle },
  { title: "Social Seller Instagram", slug: "instagram", icon: Instagram },
  { title: "Engajamento", slug: "engajamento", icon: Zap },
  { title: "Boas-vindas", slug: "boas-vindas", icon: Heart },
  { title: "Follow-up", slug: "followup", icon: Clock },
]

export function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = usePathname()
  const router = useRouter()
  const { tenant, session, isAdmin, loading } = useTenant()
  const agentesSubActive = pathname?.startsWith("/agente-ia") ?? false
  const [agentesOpen, setAgentesOpen] = useState(false)

  useEffect(() => {
    if (agentesSubActive) setAgentesOpen(true)
  }, [agentesSubActive])


  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      const loginUrl = isAdmin ? '/admin/login' : '/login'
      window.location.href = loginUrl
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  return (
    <Sidebar className="border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          aria-label="Ir para a visão geral do GerencIA Educação"
          title="GerencIA Educação"
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
          className="flex items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <img
            src="/gerencia-educacao-logo-light.svg"
            alt=""
            width={540}
            height={170}
            className="h-12 w-[190px] max-w-full object-contain object-left dark:hidden group-data-[collapsible=icon]:hidden"
          />
          <img
            src="/gerencia-educacao-logo-dark.svg"
            alt=""
            width={540}
            height={170}
            className="hidden h-12 w-[190px] max-w-full object-contain object-left dark:block group-data-[collapsible=icon]:hidden"
          />
          <img
            src="/gerencia-educacao-mark.svg"
            alt=""
            width={220}
            height={180}
            className="hidden h-10 w-10 object-contain group-data-[collapsible=icon]:block"
          />
        </Link>

        {/* Nome da Unidade */}
        {!loading && tenant?.name && (
          <div className="mt-3 px-2">
            <div className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent p-2.5">
              <Building2 className="w-4 h-4 text-[var(--accent-green)]" />
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unidade</div>
                <div className="font-semibold text-foreground text-sm">{tenant.name}</div>
              </div>
            </div>
          </div>
        )}

        {/* Botão Trocar de Cliente - apenas admin */}
        {!loading && isAdmin && (
          <div className="mt-2 px-2">
            <button
              onClick={() => router.push('/admin/units')}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-sidebar-accent border border-sidebar-border hover:border-[var(--accent-green)]/30 transition-all duration-200 group"
            >
              <Users className="w-4 h-4 text-[var(--accent-green)] group-hover:scale-105 transition-transform duration-200" />
              <div className="flex-1 text-left">
                <span className="font-medium text-foreground text-xs">Trocar de Cliente</span>
                <div className="text-[10px] text-muted-foreground">Modo Admin</div>
              </div>
            </button>
          </div>
        )}


      </SidebarHeader>

      <SidebarSeparator className="bg-sidebar-border" />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Operação educacional
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
                      <Link
                        href={item.url}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                        className="flex items-center gap-3 w-full"
                      >
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
        <SidebarSeparator className="my-2" />
        <SidebarGroup>
          <button
            onClick={() => setAgentesOpen((v) => !v)}
            className="flex items-center justify-between w-full px-4 mb-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-[0.15em] font-semibold">
                Agentes
              </span>
            </div>
            {agentesOpen
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
          {agentesOpen && (
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {agentesItems.map((item) => {
                  const url = `/agente-ia/${item.slug}`
                  const active = pathname === url || (pathname?.startsWith(url + "/") ?? false)
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.slug}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={`
                          h-10 px-3 rounded-lg transition-all duration-200
                          hover:bg-[var(--accent-green)]/8
                          ${active
                            ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-l-[3px] border-[var(--accent-green)] font-medium"
                            : "text-muted-foreground hover:text-foreground border-l-[3px] border-transparent"
                          }
                        `}
                      >
                        <Link
                          href={url}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false)
                          }}
                          className="flex items-center gap-3 w-full"
                        >
                          <Icon
                            className={`h-4 w-4 transition-colors duration-200 ${active ? "text-[var(--accent-green)]" : ""}`}
                          />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4 border-t border-sidebar-border">
        <div className="space-y-2">
          {/* Botão Sair */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full p-2.5 rounded-lg bg-[var(--accent-red)]/8 border border-[var(--accent-red)]/15 hover:border-[var(--accent-red)]/30 transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 text-[var(--accent-red)] group-hover:scale-105 transition-transform duration-200" />
            <div className="flex-1 text-left">
              <span className="font-medium text-foreground text-xs">Sair</span>
              <div className="text-[10px] text-muted-foreground">
                {loading ? 'Carregando...' : (session?.unitName || 'Desconectar')}
              </div>
            </div>
          </button>

          {/* Status */}
          <div className="text-muted-foreground px-1">
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary border border-border">
              <div className="relative">
                <div className="w-2 h-2 bg-[var(--accent-green)] rounded-full"></div>
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

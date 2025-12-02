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
import { usePathname } from "next/navigation"
import {
  BarChart3,
  MessageCircle,
  Calendar,
  Zap,
  Workflow,
  HelpCircle,
  ExternalLink,
  PauseCircle,
  FileText,
  LayoutTemplate,
} from "lucide-react"
import Link from "next/link"

const items = [
  { title: "Visão Geral", url: "/", icon: BarChart3 },
  { title: "CRM", url: "/crm", icon: LayoutTemplate },
  { title: "Conversas", url: "/conversas", icon: MessageCircle },
  { title: "Agendamentos", url: "/agendamentos", icon: Calendar },
  { title: "Follow-ups", url: "/followups", icon: Workflow },
  { title: "Pausas", url: "/pausas", icon: PauseCircle },
  { title: "Relatórios", url: "/relatorios", icon: FileText },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar className="bg-[var(--card-black)] border-[var(--border-gray)] backdrop-blur-sm">
      <SidebarHeader className="px-4 py-6 border-b border-[var(--border-gray)]">
        <div className="flex items-center gap-4 px-2">
          <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent-green)] to-[var(--dark-green)] rounded-2xl flex items-center justify-center shadow-lg shadow-[var(--accent-green)]/30 animate-pulse">
            <Zap className="h-6 w-6 text-[var(--primary-black)] font-bold" />
          </div>
          <div>
            <span className="font-bold text-[var(--pure-white)] text-lg tracking-wide">GerencIA</span>
            <div className="text-xs text-[var(--text-gray)] uppercase tracking-[0.2em] font-light">
              Agentes IA Mensuráveis
            </div>
          </div>
        </div>
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
          <a
            href="https://suporte.cliente.geniallabs.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--dark-green)]/10 border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-green)]/20 group"
          >
            <div className="relative">
              <HelpCircle className="w-5 h-5 text-[var(--accent-green)] group-hover:scale-110 transition-transform duration-300" />
              <ExternalLink className="w-3 h-3 text-[var(--accent-green)] absolute -top-1 -right-1 opacity-60" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-[var(--pure-white)] text-sm">Suporte</span>
              <div className="text-xs text-[var(--text-gray)]">Precisa de ajuda?</div>
            </div>
          </a>

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

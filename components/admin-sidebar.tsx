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
    Shield,
    Server,
    Workflow,
    Database,
    BarChart,
    FileText,
    LogOut,
    Zap,
    Terminal
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const adminItems = [
    { title: "Unidades", url: "/admin/units", icon: Server },
    { title: "Workflows (N8N)", url: "/admin/workflows", icon: Workflow },
    { title: "Prompts por Unidade", url: "/admin/prompts", icon: Terminal },
    { title: "Banco de Dados", url: "/admin/database", icon: Database },
    { title: "Resultados / Leads", url: "/admin/leads", icon: BarChart },
    { title: "Gerar Relatórios", url: "/admin/reports", icon: FileText },
]

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/admin/login'
        } catch (error) {
            console.error('Erro ao fazer logout:', error)
        }
    }

    return (
        <Sidebar className="bg-black border-r border-white/10 backdrop-blur-sm">
            <SidebarHeader className="px-4 py-6 border-b border-white/10">
                <div className="flex items-center gap-4 px-2">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-900 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/40 animate-pulse">
                        <Shield className="h-6 w-6 text-white font-bold" />
                    </div>
                    <div className="flex-1">
                        <span className="font-bold text-white text-lg tracking-wide">MASTER ADMIN</span>
                        <div className="text-xs text-gray-500 uppercase tracking-[0.2em] font-light">
                            CORE LION AI
                        </div>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarSeparator className="bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <SidebarContent className="px-2">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-gray-500 text-xs uppercase tracking-[0.15em] font-medium px-4 py-3">
                        Gestão Global
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-2">
                            {adminItems.map((item) => {
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
                        hover:bg-white/5 hover:shadow-lg hover:shadow-purple-500/10
                        hover:border-l-2 hover:border-purple-500/50
                        ${active
                                                    ? "bg-gradient-to-r from-purple-500/20 to-purple-900/10 border-l-4 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/20"
                                                    : "text-gray-400 hover:text-white"
                                                }
                      `}
                                        >
                                            <Link href={item.url} className="flex items-center gap-4 w-full">
                                                <Icon
                                                    className={`h-5 w-5 transition-all duration-300 ${active
                                                        ? "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                                                        : "group-hover:text-white"
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

            <SidebarFooter className="px-4 py-6 border-t border-white/10">
                <div className="space-y-3">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full p-3 rounded-lg bg-gradient-to-r from-red-500/20 to-red-900/10 border border-red-500/30 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 group"
                    >
                        <LogOut className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform duration-300" />
                        <div className="flex-1 text-left">
                            <span className="font-medium text-white text-sm">Sair do Master</span>
                        </div>
                    </button>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

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
        <Sidebar className="bg-[#121212] border-r border-[#2a2a2a]">
            <SidebarHeader className="px-4 py-6 border-b border-[#2a2a2a]">
                <div className="flex items-center gap-4 px-2">
                    <div className="w-10 h-10 bg-[#3ecf8e]/10 rounded-lg flex items-center justify-center border border-[#3ecf8e]/20">
                        <Shield className="h-5 w-5 text-[#3ecf8e]" />
                    </div>
                    <div className="flex-1">
                        <span className="font-bold text-[#ededed] text-lg tracking-wide">GerencIA</span>
                        <div className="text-[10px] text-[#888] uppercase tracking-[0.2em] font-medium">
                            Master Panel
                        </div>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="px-2 mt-4">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[#666] text-xs uppercase tracking-wider font-semibold px-4 mb-2">
                        Gestão Global
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-1">
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
                        h-10 px-4 rounded-md transition-all duration-200
                        ${active
                                                    ? "bg-[#3ecf8e]/10 text-[#3ecf8e] border-l-2 border-[#3ecf8e]"
                                                    : "text-[#999] hover:text-[#ededed] hover:bg-[#1a1a1a]"
                                                }
                      `}
                                        >
                                            <Link href={item.url} className="flex items-center gap-3 w-full">
                                                <Icon
                                                    className={`h-4 w-4 ${active ? "text-[#3ecf8e]" : "text-[#777] group-hover:text-[#ededed]"}`}
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

            <SidebarFooter className="px-4 py-6 border-t border-[#2a2a2a]">
                <div className="space-y-3">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full p-2 rounded-md text-[#666] hover:text-[#ff4b4b] hover:bg-[#ff4b4b]/10 transition-colors group"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="font-medium text-sm">Sair</span>
                    </button>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

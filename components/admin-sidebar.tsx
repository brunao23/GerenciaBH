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
    Shield,
    Server,
    BarChart,
    FileText,
    LogOut,
    Zap,
    MessageCircle,
    Instagram,
    Target,
    Smartphone,
    Bot,
    ChevronDown,
    ChevronRight,
    Heart,
    Clock,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const adminItems = [
    { title: "Unidades", url: "/admin/units", icon: Server },
    { title: "Resultados / Leads", url: "/admin/leads", icon: BarChart },
    { title: "Gerar Relatórios", url: "/admin/reports", icon: FileText },
    { title: "Testadores Instagram", url: "/admin/instagram-testers", icon: Instagram },
    { title: "Meta Lead Ads", url: "/admin/meta-lead-pages", icon: Target },
    { title: "Instâncias Z-API", url: "/admin/instancias", icon: Smartphone },
]

const agentesItems = [
    { title: "Agente Qualificador WhatsApp", slug: "whatsapp", icon: MessageCircle },
    { title: "Agente Social Seller Instagram", slug: "instagram", icon: Instagram },
    { title: "Agente de Engajamento (Bolo)", slug: "engajamento", icon: Zap },
    { title: "Agente de Boas Vindas", slug: "boas-vindas", icon: Heart },
    { title: "Agente de Follow-Up", slug: "followup", icon: Clock },
]

export function AdminSidebar() {
    const { isMobile, setOpenMobile } = useSidebar()
    const pathname = usePathname()
    const router = useRouter()

    const unitIdMatch = pathname?.match(/\/admin\/units\/([^/]+)/)
    const currentUnitId = unitIdMatch?.[1] ?? null

    const agentesSubActive = currentUnitId
        ? (pathname?.includes(`/admin/units/${currentUnitId}/agentes`) ?? false)
        : false

    const [agentesOpen, setAgentesOpen] = useState(false)

    useEffect(() => {
        if (agentesSubActive) setAgentesOpen(true)
    }, [agentesSubActive])

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/admin/login'
        } catch (error) {
            console.error('Erro ao fazer logout:', error)
        }
    }

    return (
        <Sidebar className="bg-sidebar border-r border-sidebar-border">
            <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                        <span className="font-bold text-foreground text-lg tracking-tight">GerencIA</span>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
                            Master Panel
                        </div>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent className="px-2 mt-4">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-muted-foreground text-[10px] uppercase tracking-[0.15em] font-semibold px-4 mb-2">
                        Gestão Global
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-0.5">
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
                                                h-10 px-3 rounded-lg transition-all duration-200
                                                hover:bg-primary/8
                                            ${active
                                                    ? "bg-primary/10 text-primary border-l-[3px] border-primary font-medium"
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
                                                    className={`h-4 w-4 transition-colors duration-200 ${active ? "text-primary" : ""}`}
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

                {currentUnitId && (
                    <>
                        <SidebarSeparator className="my-2" />
                        <SidebarGroup>
                            <button
                                onClick={() => setAgentesOpen((v) => !v)}
                                className="flex items-center justify-between w-full px-4 mb-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Bot className="h-3.5 w-3.5" />
                                    <span className="text-[10px] uppercase tracking-[0.15em] font-semibold">
                                        Agentes de IA
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
                                            const url = `/admin/units/${currentUnitId}/agentes/${item.slug}`
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
                                                            hover:bg-primary/8
                                                            ${active
                                                                ? "bg-primary/10 text-primary border-l-[3px] border-primary font-medium"
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
                                                                className={`h-4 w-4 transition-colors duration-200 ${active ? "text-primary" : ""}`}
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
                    </>
                )}
            </SidebarContent>

            <SidebarFooter className="px-4 py-4 border-t border-sidebar-border">
                <div className="space-y-2">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full p-2.5 rounded-lg text-muted-foreground hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/8 transition-colors group"
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

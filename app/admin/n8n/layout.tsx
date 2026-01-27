"use client"

import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    LayoutDashboard,
    Workflow,
    History,
    AlertTriangle,
    Menu,
    X,
    ChevronRight,
    LogOut,
    BarChart3
} from "lucide-react"
import { useState } from "react"

const menuItems = [
    {
        title: "Dashboard",
        icon: LayoutDashboard,
        href: "/admin/n8n/dashboard",
        description: "Visão geral e métricas"
    },
    {
        title: "Workflows",
        icon: Workflow,
        href: "/admin/n8n/workflows",
        description: "Gerenciar workflows"
    },
    {
        title: "Execuções",
        icon: History,
        href: "/admin/n8n/executions",
        description: "Histórico completo"
    },
    {
        title: "Monitor de Erros",
        icon: AlertTriangle,
        href: "/admin/n8n/errors",
        description: "Análise de falhas"
    },
    {
        title: "Analytics",
        icon: BarChart3,
        href: "/admin/n8n/analytics",
        description: "Relatórios avançados"
    }
]

export default function N8NLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const currentPage = menuItems.find(item => pathname?.startsWith(item.href))

    return (
        <div className="min-h-screen bg-primary-black">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card-black border-b border-border-gray">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-xl flex items-center justify-center">
                            <Workflow className="w-5 h-5 text-primary-black" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-accent-yellow">N8N Manager</h1>
                            <p className="text-xs text-text-gray">{currentPage?.title}</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="text-pure-white"
                    >
                        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </Button>
                </div>
            </div>

            {/* Sidebar */}
            <aside className={`
                fixed top-0 left-0 h-full w-72 bg-card-black border-r border-border-gray z-40
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}>
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-6 border-b border-border-gray">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-xl flex items-center justify-center shadow-lg shadow-accent-yellow/30">
                                <Workflow className="w-6 h-6 text-primary-black" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold bg-gradient-to-r from-accent-yellow to-dark-yellow bg-clip-text text-transparent">
                                    N8N Manager
                                </h1>
                                <p className="text-xs text-text-gray">Plataforma Completa</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto p-4">
                        <div className="space-y-2">
                            {menuItems.map((item) => {
                                const Icon = item.icon
                                const isActive = pathname?.startsWith(item.href)

                                return (
                                    <button
                                        key={item.href}
                                        onClick={() => {
                                            router.push(item.href)
                                            setSidebarOpen(false)
                                        }}
                                        className={`
                                            w-full flex items-center gap-3 p-3 rounded-lg transition-all
                                            ${isActive
                                                ? 'bg-gradient-to-r from-accent-yellow to-dark-yellow text-primary-black shadow-lg shadow-accent-yellow/30'
                                                : 'text-text-gray hover:text-pure-white hover:bg-primary-black/50'}
                                        `}
                                    >
                                        <Icon className="w-5 h-5 flex-shrink-0" />
                                        <div className="flex-1 text-left">
                                            <div className={`font-semibold ${isActive ? 'text-primary-black' : ''}`}>
                                                {item.title}
                                            </div>
                                            <div className={`text-xs ${isActive ? 'text-primary-black/70' : 'text-text-gray'}`}>
                                                {item.description}
                                            </div>
                                        </div>
                                        {isActive && <ChevronRight className="w-5 h-5 flex-shrink-0" />}
                                    </button>
                                )
                            })}
                        </div>
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-border-gray">
                        <Button
                            variant="ghost"
                            onClick={() => router.push('/admin/dashboard')}
                            className="w-full justify-start text-text-gray hover:text-pure-white"
                        >
                            <LogOut className="w-5 h-5 mr-3" />
                            Voltar ao Admin
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Overlay para mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <div className="lg:ml-72">
                {/* Desktop Header - Breadcrumb */}
                <div className="hidden lg:block sticky top-0 z-20 bg-card-black/95 backdrop-blur-sm border-b border-border-gray">
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                            <button
                                onClick={() => router.push('/admin/dashboard')}
                                className="text-text-gray hover:text-accent-yellow transition-colors"
                            >
                                Admin
                            </button>
                            <ChevronRight className="w-4 h-4 text-text-gray" />
                            <button
                                onClick={() => router.push('/admin/n8n/dashboard')}
                                className="text-text-gray hover:text-accent-yellow transition-colors"
                            >
                                N8N
                            </button>
                            {currentPage && (
                                <>
                                    <ChevronRight className="w-4 h-4 text-text-gray" />
                                    <span className="text-accent-yellow font-semibold">
                                        {currentPage.title}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="pt-16 lg:pt-0">
                    {children}
                </div>
            </div>
        </div>
    )
}

"use client"

import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <SidebarProvider>
                <AdminSidebar />
                <SidebarInset className="bg-[#000000] text-[#ededed]">
                    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-[#2a2a2a] bg-[#121212]/80 px-4 backdrop-blur-sm">
                        <SidebarTrigger className="text-[#888] hover:text-white hover:bg-[#2a2a2a]" />
                        <div className="h-4 w-[1px] bg-[#333]" />
                        <div className="font-medium text-sm text-[#ededed]">Gerenciamento Geral</div>
                    </header>
                    <main className="p-6 overflow-auto h-[calc(100vh-3.5rem)]">{children}</main>
                    <Toaster />
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    )
}

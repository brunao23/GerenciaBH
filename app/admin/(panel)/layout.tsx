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
                <SidebarInset className="bg-[#0a0a0a]">
                    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-white/10 bg-black/50 px-4 backdrop-blur-md">
                        <SidebarTrigger className="text-white hover:bg-white/10" />
                        <div className="font-semibold text-purple-400">Master Panel</div>
                    </header>
                    <main className="p-6 overflow-auto h-[calc(100vh-3.5rem)]">{children}</main>
                    <Toaster />
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    )
}

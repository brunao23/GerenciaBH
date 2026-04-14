"use client"

import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/sonner"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AdminSidebar />
            <SidebarInset className="bg-background text-foreground">
                <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-card/90 px-4 backdrop-blur-xl">
                    <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-primary/8 rounded-lg" />
                    <div className="h-4 w-[1px] bg-border" />
                    <div className="font-medium text-sm text-foreground">Gerenciamento Geral</div>
                    <div className="ml-auto">
                        <ThemeToggle />
                    </div>
                </header>
                <main className="p-6 overflow-auto h-[calc(100vh-3.5rem)]">{children}</main>
                <Toaster />
            </SidebarInset>
        </SidebarProvider>
    )
}

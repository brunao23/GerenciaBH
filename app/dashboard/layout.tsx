import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import NotificationsMenu from "../../components/notifications-menu"
import NotificationCenter from "../../components/notification-center"
import FeedbackWidget from "../../components/feedback-widget"
import { TenantSelector } from "../../components/saas/TenantSelector"
import { ThemeToggle } from "../../components/theme-toggle"
import { Toaster } from "../../components/ui/sonner"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card/90 px-3 sm:px-4 backdrop-blur-xl">
          <SidebarTrigger className="genial-hover border border-transparent hover:border-primary/30 hover:bg-primary/8 rounded-lg" />
          <div className="font-semibold text-primary font-display tracking-tight text-sm sm:text-base">GerencIA</div>
          <div className="ml-auto flex items-center gap-2">
            <TenantSelector />
            <ThemeToggle />
            <NotificationsMenu />
          </div>
        </header>
        <main className="p-6 genial-scrollbar overflow-auto">{children}</main>
        <FeedbackWidget />
        <NotificationCenter />
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  )
}

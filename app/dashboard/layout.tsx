import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import { ThemeProvider } from "../../components/theme-provider"
import NotificationsMenu from "../../components/notifications-menu"
import NotificationCenter from "../../components/notification-center"
import FeedbackWidget from "../../components/feedback-widget"
import { TenantSelector } from "../../components/saas/TenantSelector"
import { Toaster } from "../../components/ui/sonner"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-accent-green/15 bg-card/85 px-4 backdrop-blur-md">
            <SidebarTrigger className="genial-hover border border-transparent hover:border-accent-green/35 hover:bg-accent-green/10 rounded-md" />
            <div className="font-semibold text-accent-green font-display tracking-tight">GerencIA</div>
            <div className="ml-auto flex items-center gap-2">
              <TenantSelector />
              <NotificationsMenu />
            </div>
          </header>
          <main className="p-6 genial-scrollbar overflow-auto">{children}</main>
          <FeedbackWidget />
          <NotificationCenter />
          <Toaster />
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}

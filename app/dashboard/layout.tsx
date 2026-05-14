import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import NotificationsMenu from "../../components/notifications-menu"
import NotificationCenter from "../../components/notification-center"
import FeedbackWidget from "../../components/feedback-widget"
import { TenantSelector } from "../../components/saas/TenantSelector"
import { ThemeToggle } from "../../components/theme-toggle"
import { Toaster } from "../../components/ui/sonner"
import { GraduationCap } from "lucide-react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="education-app-shell">
        <header className="education-topbar sticky top-0 z-10 flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4">
          <SidebarTrigger className="genial-hover border border-transparent hover:border-primary/30 hover:bg-primary/8 rounded-lg" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
              <GraduationCap className="h-4 w-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-sm font-bold tracking-tight text-primary sm:text-base">GerencIA Educação</div>
              <div className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">captação e matrículas</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <TenantSelector />
            <ThemeToggle />
            <NotificationsMenu />
          </div>
        </header>
        <main className="overflow-auto p-3 genial-scrollbar sm:p-4 md:p-6">{children}</main>
        <FeedbackWidget />
        <NotificationCenter />
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  )
}

import type React from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import { ThemeProvider } from "../../components/theme-provider"
import NotificationsMenu from "../../components/notifications-menu"
import NotificationCenter from "../../components/notification-center"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border/50 bg-card/80 px-4 backdrop-blur-md genial-card">
            <SidebarTrigger className="genial-hover" />
            <div className="font-semibold text-accent-green">GerencIA</div>
            <div className="ml-auto" />
            <NotificationsMenu />
          </header>
          <main className="p-6 genial-scrollbar overflow-auto">{children}</main>
          <NotificationCenter />
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}

"use client"

import type React from "react"
import { lazy, Suspense } from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import { ThemeProvider } from "../../components/theme-provider"
import NotificationsMenu from "../../components/notifications-menu"
import { Toaster } from "../../components/ui/sonner"
import { TenantSelector } from "../../components/saas/TenantSelector"

const NotificationCenter = lazy(() => import("../../components/notification-center"))
const FeedbackWidget = lazy(() => import("../../components/feedback-widget"))

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-accent-green/15 bg-card/85 px-3 sm:px-4 backdrop-blur-md safe-area-top">
            <SidebarTrigger className="genial-hover border border-transparent hover:border-accent-green/35 hover:bg-accent-green/10 rounded-md" />
            <div className="font-semibold text-accent-green font-display tracking-tight text-sm sm:text-base">GerencIA</div>
            <div className="ml-auto flex items-center gap-2">
              <TenantSelector />
              <NotificationsMenu />
            </div>
          </header>
          <main className="p-3 sm:p-4 md:p-6 genial-scrollbar scroll-smooth-gpu overflow-auto safe-area-bottom">{children}</main>
          <Suspense fallback={null}>
            <FeedbackWidget />
            <NotificationCenter />
          </Suspense>
          <Toaster />
          <style jsx global>{`
            div[id*="v0-built-with-button"] {
              display: none !important;
              opacity: 0 !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          `}</style>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}

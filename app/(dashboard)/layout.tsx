"use client"

import type React from "react"
import { lazy, Suspense, useState } from "react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import NotificationsMenu from "../../components/notifications-menu"
import { Toaster } from "../../components/ui/sonner"
import { TenantSelector } from "../../components/saas/TenantSelector"
import { ThemeToggle } from "../../components/theme-toggle"
import OnboardingTour from "../../components/onboarding/OnboardingTour"

const NotificationCenter = lazy(() => import("../../components/notification-center"))
const FeedbackWidget = lazy(() => import("../../components/feedback-widget"))

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [onboardingForceOpen, setOnboardingForceOpen] = useState(false)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card/90 px-3 sm:px-4 backdrop-blur-xl safe-area-top">
            <SidebarTrigger className="genial-hover border border-transparent hover:border-primary/30 hover:bg-primary/8 rounded-lg" />
            <div className="font-semibold text-primary font-display tracking-tight text-sm sm:text-base">GerencIA</div>
            <div className="ml-auto flex items-center gap-2">
              <TenantSelector />
              <ThemeToggle />
              <NotificationsMenu />
              <button
                onClick={() => setOnboardingForceOpen(true)}
                title="Ver tour de introdução"
                className="genial-hover flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/8 hover:text-primary text-sm font-bold transition-colors"
              >
                ?
              </button>
            </div>
          </header>
          <main className="p-3 sm:p-4 md:p-6 genial-scrollbar scroll-smooth-gpu overflow-auto safe-area-bottom">{children}</main>
          <Suspense fallback={null}>
            <FeedbackWidget />
            <NotificationCenter />
          </Suspense>
          <OnboardingTour forceOpen={onboardingForceOpen} onClose={() => setOnboardingForceOpen(false)} />
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
  )
}

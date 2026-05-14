"use client"

import type React from "react"
import { lazy, Suspense, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar"
import { AppSidebar } from "../../components/app-sidebar"
import NotificationsMenu from "../../components/notifications-menu"
import { Toaster } from "../../components/ui/sonner"
import { TenantSelector } from "../../components/saas/TenantSelector"
import { ThemeToggle } from "../../components/theme-toggle"
import OnboardingTour from "../../components/onboarding/OnboardingTour"
import { GraduationCap } from "lucide-react"

const NotificationCenter = lazy(() => import("../../components/notification-center"))
const FeedbackWidget = lazy(() => import("../../components/feedback-widget"))

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [onboardingForceOpen, setOnboardingForceOpen] = useState(false)
  const pathname = usePathname()
  const isConversationsPage = pathname?.startsWith("/conversas")

  useEffect(() => {
    if (!isConversationsPage || typeof window === "undefined") return

    const root = document.documentElement
    const updateVisualHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight
      root.style.setProperty("--app-visual-height", `${Math.round(height)}px`)
    }

    updateVisualHeight()
    window.visualViewport?.addEventListener("resize", updateVisualHeight)
    window.visualViewport?.addEventListener("scroll", updateVisualHeight)
    window.addEventListener("resize", updateVisualHeight)
    window.addEventListener("orientationchange", updateVisualHeight)

    return () => {
      window.visualViewport?.removeEventListener("resize", updateVisualHeight)
      window.visualViewport?.removeEventListener("scroll", updateVisualHeight)
      window.removeEventListener("resize", updateVisualHeight)
      window.removeEventListener("orientationchange", updateVisualHeight)
      root.style.removeProperty("--app-visual-height")
    }
  }, [isConversationsPage])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="education-app-shell h-dvh min-h-dvh max-h-dvh overflow-hidden">
          <header className={`education-topbar sticky top-0 z-20 items-center backdrop-blur-xl safe-area-top ${isConversationsPage ? "hidden h-16 gap-3 overflow-hidden px-4 lg:flex" : "flex h-14 gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4"}`}>
            <SidebarTrigger className="genial-hover border border-transparent hover:border-primary/30 hover:bg-primary/8 rounded-lg" />
            <div className={`min-w-0 items-center gap-2 ${isConversationsPage ? "hidden min-[380px]:flex" : "flex"}`}>
              <span className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
                <GraduationCap className="h-4 w-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate font-display text-sm font-bold tracking-tight text-primary sm:text-base">GerencIA Educação</div>
                <div className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">captação e matrículas</div>
              </div>
            </div>
            <div className={`ml-auto flex min-w-0 items-center ${isConversationsPage ? "gap-1.5 sm:gap-2" : "gap-2"}`}>
              <TenantSelector />
              <ThemeToggle />
              <NotificationsMenu />
              <button
                onClick={() => setOnboardingForceOpen(true)}
                title="Ver tour de introdução"
                className={`${isConversationsPage ? "hidden sm:flex" : "flex"} genial-hover h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/8 hover:text-primary text-sm font-bold transition-colors`}
              >
                ?
              </button>
            </div>
          </header>
          <main
            className={
              isConversationsPage
                ? "flex-1 min-h-0 overflow-hidden p-0 genial-scrollbar scroll-smooth-gpu"
                : "flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-24 md:pb-6 genial-scrollbar scroll-smooth-gpu safe-area-bottom"
            }
          >
            {children}
          </main>
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

            @media (max-width: 1023px) {
              .conversations-whatsapp-shell {
                height: var(--app-visual-height, 100svh) !important;
                min-height: var(--app-visual-height, 100svh) !important;
                max-height: var(--app-visual-height, 100svh) !important;
                width: 100% !important;
                max-width: 100vw !important;
                overflow: hidden !important;
              }

              .conversations-whatsapp-shell .conversation-list-panel,
              .conversations-whatsapp-shell .conversation-chat-panel {
                height: var(--app-visual-height, 100svh) !important;
                min-height: var(--app-visual-height, 100svh) !important;
                max-height: var(--app-visual-height, 100svh) !important;
                width: 100% !important;
                max-width: 100vw !important;
              }

              .conversations-whatsapp-shell .conversation-actions-strip {
                max-width: 100% !important;
                overflow: visible !important;
              }
            }
          `}</style>
        </SidebarInset>
      </SidebarProvider>
  )
}

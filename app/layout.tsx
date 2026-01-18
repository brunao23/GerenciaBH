import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "GerencIA By CORE LION AI - Gestão Inteligente Multi-Tenant",
  description:
    "Plataforma completa de gestão com IA para múltiplas unidades. CRM, agendamentos, follow-ups automáticos e relatórios em tempo real. Powered by CORE LION AI.",
  generator: "GerencIA By CORE LION AI",
}

import { TenantProvider } from '@/lib/contexts/TenantContext'
import { Toaster } from "@/components/ui/sonner"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <TenantProvider>
          {children}
          <Toaster />
        </TenantProvider>
      </body>
    </html>
  )
}

import type React from "react"
import type { Metadata } from "next"
import { Manrope, Sora } from "next/font/google"
import "./globals.css"

export const metadata: Metadata = {
  title: "GerencIA by Genial Labs AI - Gestao Inteligente Multi-Tenant",
  description:
    "Plataforma completa de gestao com IA para multiplas unidades. CRM, agendamentos, follow-ups automaticos e relatorios em tempo real. Powered by Genial Labs AI.",
  generator: "GerencIA by Genial Labs AI",
}

import { TenantProvider } from '@/lib/contexts/TenantContext'
import { Toaster } from "@/components/ui/sonner"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sora.variable} antialiased`} suppressHydrationWarning>
        <TenantProvider>
          {children}
          <Toaster />
        </TenantProvider>
      </body>
    </html>
  )
}

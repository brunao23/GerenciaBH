import type React from "react"
import type { Metadata } from "next"
import { Manrope, Sora } from "next/font/google"
import "./globals.css"

export const metadata: Metadata = {
  title: "GerencIA by Genial Labs AI | Gestão inteligente multi-tenant",
  description:
    "Plataforma completa de gestão com IA para múltiplas unidades. CRM, agendamentos, follow-ups automáticos e relatórios em tempo real.",
  generator: "GerencIA by Genial Labs AI",
}

import { TenantProvider } from '@/lib/contexts/TenantContext'
import { ThemeProvider } from "@/components/theme-provider"
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
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TenantProvider>
            {children}
            <Toaster />
          </TenantProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

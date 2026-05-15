import type React from "react"
import type { Metadata, Viewport } from "next"
import { Manrope, Sora } from "next/font/google"
import "./globals.css"

export const metadata: Metadata = {
  title: "GerencIA Educação | Captação, atendimento e matrículas com IA",
  description:
    "Plataforma educacional com IA para captação, atendimento, agenda, follow-ups e matrículas em múltiplas unidades.",
  generator: "GerencIA Educação by Genial Labs AI",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: true,
  maximumScale: 1,
}

import { TenantProvider } from '@/lib/contexts/TenantContext'
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { ChunkReloadGuard } from "@/components/runtime/ChunkReloadGuard"

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
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sora.variable} h-full min-h-dvh overflow-x-hidden antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TenantProvider>
            <ChunkReloadGuard />
            {children}
            <Toaster />
          </TenantProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

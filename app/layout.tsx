import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "GerencIA - Agentes de IA que Geram Resultados Mensuráveis",
  description:
    "Plataforma que resolve o maior problema da IA: a falta de mensuração. Transforme agentes de IA em resultados visuais e comprováveis.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  )
}

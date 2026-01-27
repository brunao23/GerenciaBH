"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function N8NHomePage() {
    const router = useRouter()

    useEffect(() => {
        // Redirecionar automaticamente para o dashboard
        router.push('/admin/n8n/dashboard')
    }, [router])

    return (
        <div className="min-h-screen bg-primary-black flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-accent-yellow to-dark-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-accent-yellow/30 mx-auto mb-4 animate-pulse">
                    <svg className="w-8 h-8 text-primary-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <p className="text-text-gray">Redirecionando para o dashboard...</p>
            </div>
        </div>
    )
}

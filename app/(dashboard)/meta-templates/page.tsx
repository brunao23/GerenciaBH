"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function MetaTemplatesPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/disparos#meta-templates")
  }, [router])

  return (
    <div className="flex-1 space-y-3 p-6">
      <h1 className="text-2xl font-semibold text-pure-white">Templates Meta</h1>
      <p className="text-sm text-text-gray">
        Esta pagina foi movida para Disparos. Redirecionando...
      </p>
    </div>
  )
}

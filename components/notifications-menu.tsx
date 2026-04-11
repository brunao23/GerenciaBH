"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ScrollArea } from "./ui/scroll-area"
import { AlertTriangle, Bell, CalendarClock, MessageSquare, Trophy, Trash2 } from "lucide-react"
import { supabaseClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useTenantFetch } from "@/lib/hooks/useTenantFetch"
import { useTenant } from "@/lib/contexts/TenantContext"

type NotificationRecord = {
  id: string
  created_at: string
  type: string
  title: string | null
  description: string | null
  message?: string | null
  read: boolean
  source_table?: string | null
  source_id?: string | null
  session_id?: string | null
  numero?: string | null
}

function fmtBR(iso: string | undefined | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
      hour12: false,
    }).format(d)
  } catch {
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })
  }
}

const onlyDigits = (s: string) => s.replace(/\D+/g, "")

function normalizeType(type: string | null | undefined): "message" | "error" | "agendamento" | "followup" | "victory" {
  const value = String(type || "").toLowerCase()

  if (value.includes("erro") || value.includes("error")) return "error"
  if (value.includes("agend")) return "agendamento"
  if (value.includes("follow")) return "followup"
  if (value.includes("victory") || value.includes("ganho") || value.includes("convers")) return "victory"

  return "message"
}

export default function NotificationsMenu() {
  const tenantFetch = useTenantFetch()
  const { tenant, loading } = useTenant()
  const [items, setItems] = useState<NotificationRecord[]>([])
  const [unread, setUnread] = useState<number>(0)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [supa, setSupa] = useState<ReturnType<typeof supabaseClient> | null>(null)
  const channelScope = useRef(`menu-${Math.random().toString(36).slice(2, 10)}`)
  const router = useRouter()
  const { toast } = useToast()

  const notificationsTable = useMemo(() => {
    if (!tenant?.prefix) return null
    return `${tenant.prefix}_notifications`
  }, [tenant?.prefix])

  const refresh = useCallback(async () => {
    if (loading || !tenant) return

    try {
      const res = await tenantFetch("/api/supabase/notifications?limit=30")
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao carregar notificacoes")
      }

      setItems(Array.isArray(data.items) ? data.items : [])
      setUnread(typeof data.unread === "number" ? data.unread : 0)
    } catch (error: any) {
      toast({
        title: "Falha ao carregar notificacoes",
        description: error?.message || "Tente novamente em alguns instantes.",
        variant: "destructive",
      })
    }
  }, [loading, tenant, tenantFetch, toast])

  useEffect(() => {
    try {
      const client = supabaseClient()
      setSupa(client)
    } catch (error) {
      console.error("[notifications-menu] Failed to initialize Supabase client:", error)
    }
  }, [])

  useEffect(() => {
    if (!supa || loading || !tenant || !notificationsTable) return

    refresh()

    const channel = supa
      .channel(`realtime:${channelScope.current}:${notificationsTable}`)
      .on("postgres_changes", { event: "*", schema: "public", table: notificationsTable }, () => {
        refresh()
      })
      .subscribe()

    return () => {
      supa.removeChannel(channel)
    }
  }, [supa, loading, tenant, notificationsTable, refresh])

  const markAllRead = async () => {
    if (markingAllRead) return

    setMarkingAllRead(true)
    try {
      const response = await tenantFetch("/api/supabase/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any))
        throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.ok) {
        toast({
          title: "Sucesso",
          description: `${result.updated || 0} notificacoes marcadas como lidas`,
        })
        await refresh()
      } else {
        throw new Error(result.error || "Erro desconhecido")
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao marcar notificacoes como lidas",
        variant: "destructive",
      })
    } finally {
      setMarkingAllRead(false)
    }
  }

  const clearAll = async () => {
    if (clearingAll) return

    setClearingAll(true)
    try {
      const response = await tenantFetch("/api/supabase/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any))
        throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.ok) {
        toast({
          title: "Sucesso",
          description: `${result.deleted || 0} notificacoes removidas`,
        })
        await refresh()
      } else {
        throw new Error(result.error || "Erro desconhecido")
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao limpar notificacoes",
        variant: "destructive",
      })
    } finally {
      setClearingAll(false)
    }
  }

  const clickNotification = async (n: NotificationRecord) => {
    await tenantFetch("/api/supabase/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [n.id] }),
    }).catch(() => null)

    const tone = normalizeType(n.type)

    if (tone === "message" || tone === "error" || tone === "victory") {
      if (n.session_id) {
        const qs = new URLSearchParams()
        qs.set("session", n.session_id)
        if (n.source_id) qs.set("focus", n.source_id)
        router.push(`/conversas?${qs.toString()}`)
        return
      }
      if (n.numero) {
        const qs = new URLSearchParams()
        qs.set("numero", onlyDigits(n.numero))
        router.push(`/conversas?${qs.toString()}`)
        return
      }
      router.push("/conversas")
      return
    }

    if (tone === "agendamento") {
      router.push("/agendamentos")
      return
    }

    if (tone === "followup") {
      if (n.numero) {
        const qs = new URLSearchParams()
        qs.set("numero", onlyDigits(n.numero))
        router.push(`/conversas?${qs.toString()}`)
      } else {
        router.push("/conversas")
      }
      return
    }
  }

  const hasUnread = unread > 0

  const IconFor = ({ type }: { type: string }) => {
    switch (normalizeType(type)) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      case "agendamento":
        return <CalendarClock className="h-4 w-4 text-emerald-600" />
      case "followup":
        return <MessageSquare className="h-4 w-4 text-purple-600" />
      case "victory":
        return <Trophy className="h-4 w-4 text-emerald-600" />
      default:
        return <MessageSquare className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Notificacoes"
          className="relative border border-transparent hover:border-accent-green/40 hover:bg-accent-green/10"
        >
          <Bell className="h-5 w-5" />
          {hasUnread ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0 border-accent-green/20 bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 py-2 bg-accent-green/5">
          <Button variant="ghost" size="sm" onClick={refresh} className="text-xs px-2 py-1 h-7">
            Atualizar
          </Button>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={markAllRead}
              disabled={markingAllRead}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2 py-1 h-7 min-w-0 whitespace-nowrap"
            >
              {markingAllRead ? "Marcando..." : "Marcar como lidas"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={clearAll}
              disabled={clearingAll}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 h-7 min-w-0 flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              {clearingAll ? "Limpando..." : "Limpar"}
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notificacoes</DropdownMenuLabel>
          <div className="text-xs text-muted-foreground">{unread} nao lida(s)</div>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-[360px]">
          <div className="px-1 py-1">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">Sem notificacoes.</div>
            ) : (
              items.map((n) => {
                const type = normalizeType(n.type)
                const tone =
                  type === "error"
                    ? "bg-red-50"
                    : type === "victory"
                      ? "bg-emerald-50"
                      : type === "agendamento"
                        ? "bg-sky-50"
                        : type === "followup"
                          ? "bg-purple-50"
                          : ""

                return (
                  <DropdownMenuItem
                    key={n.id}
                    className={cn("px-3 py-2", n.read ? "" : "bg-muted/30", tone)}
                    onClick={() => clickNotification(n)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        <IconFor type={n.type} />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "text-sm",
                            type === "error" ? "text-red-700 font-medium" : "",
                            type === "victory" ? "text-emerald-700 font-medium" : "font-medium",
                          )}
                        >
                          {n.title ?? n.type ?? "Notificacao"}
                        </div>
                        {n.description || n.message ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {n.description ?? n.message}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground mt-0.5">{fmtBR(n.created_at)}</div>
                      </div>
                    </div>
                  </DropdownMenuItem>
                )
              })
            )}
          </div>
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">
            {items.length > 0 ? `Mostrando ${items.length} notificacoes` : "Nenhuma notificacao"}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

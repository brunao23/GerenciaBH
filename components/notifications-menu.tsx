"use client"

import { useEffect, useState } from "react"
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

type Notification = {
  id: string
  created_at: string
  type: "message" | "error" | "agendamento" | "followup" | "victory"
  title: string | null
  description: string | null
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

export default function NotificationsMenu() {
  const tenantFetch = useTenantFetch()
  const { tenant, loading } = useTenant() // Adicionar tenant e loading
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState<number>(0)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [supa, setSupa] = useState<ReturnType<typeof supabaseClient> | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const refresh = async () => {
    // Não buscar se tenant ainda está carregando
    if (loading || !tenant) {
      console.log("[v0] NotificationsMenu: Aguardando tenant carregar...")
      return
    }

    console.log("[v0] NotificationsMenu: Iniciando refresh...")
    const res = await tenantFetch("/api/supabase/notifications?limit=30")
    const data = await res.json()
    console.log("[v0] NotificationsMenu: Dados recebidos:", {
      itemsCount: Array.isArray(data.items) ? data.items.length : 0,
      unreadCount: data.unread,
      items: data.items?.slice(0, 3), // Primeiros 3 para debug
    })
    setItems(Array.isArray(data.items) ? data.items : [])
    setUnread(typeof data.unread === "number" ? data.unread : 0)
  }

  useEffect(() => {
    try {
      const client = supabaseClient()
      setSupa(client)
    } catch (error) {
      console.error("[v0] Failed to initialize Supabase client:", error)
      return
    }
  }, [])

  useEffect(() => {
    // Aguardar tenant e supabase estarem prontos
    if (!supa || loading || !tenant) {
      console.log("[v0] NotificationsMenu: Aguardando inicialização...", { supa: !!supa, loading, tenant: !!tenant })
      return
    }

    refresh()
    const ch = supa
      .channel("realtime:notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        refresh()
      })
      .subscribe()
    return () => {
      supa.removeChannel(ch)
    }
  }, [supa, loading, tenant])

  const markAllRead = async () => {
    console.log("[v0] markAllRead: BOTÃO CLICADO! unread:", unread, "markingAllRead:", markingAllRead)

    if (markingAllRead) {
      console.log("[v0] markAllRead: Já está marcando, saindo...")
      return
    }

    console.log("[v0] markAllRead: Continuando com a marcação...")

    setMarkingAllRead(true)
    console.log("[v0] Marcando todas as notificações como lidas...")

    try {
      const response = await tenantFetch("/api/supabase/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })

      console.log("[v0] Resposta da API:", response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("[v0] Erro na resposta da API:", errorData)
        throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log("[v0] Resultado da API:", result)

      if (result.ok) {
        toast({
          title: "Sucesso",
          description: `${result.updated || 0} notificações marcadas como lidas`,
        })
        await refresh()
      } else {
        throw new Error(result.error || "Erro desconhecido")
      }
    } catch (error) {
      console.error("[v0] Erro ao marcar notificações como lidas:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao marcar notificações como lidas",
        variant: "destructive",
      })
    } finally {
      setMarkingAllRead(false)
    }
  }

  const clearAll = async () => {
    console.log("[v0] clearAll: BOTÃO CLICADO!")

    if (clearingAll) {
      console.log("[v0] clearAll: Já está limpando, saindo...")
      return
    }

    setClearingAll(true)
    console.log("[v0] Limpando todas as notificações...")

    try {
      const response = await tenantFetch("/api/supabase/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })

      console.log("[v0] Resposta da API (DELETE):", response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("[v0] Erro na resposta da API (DELETE):", errorData)
        throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log("[v0] Resultado da API (DELETE):", result)

      if (result.ok) {
        toast({
          title: "Sucesso",
          description: `${result.deleted || 0} notificações removidas`,
        })
        await refresh()
      } else {
        throw new Error(result.error || "Erro desconhecido")
      }
    } catch (error) {
      console.error("[v0] Erro ao limpar notificações:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao limpar notificações",
        variant: "destructive",
      })
    } finally {
      setClearingAll(false)
    }
  }

  const clickNotification = async (n: Notification) => {
    await tenantFetch("/api/supabase/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [n.id] }),
    }).catch(() => null)

    if (n.type === "message" || n.type === "error" || n.type === "victory") {
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

    if (n.type === "agendamento") {
      router.push("/agendamentos")
      return
    }

    if (n.type === "followup") {
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

  const IconFor = ({ type }: { type: Notification["type"] }) => {
    switch (type) {
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
        <Button size="icon" variant="ghost" aria-label="Notificações" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={refresh} className="text-xs px-2 py-1 h-7">
            Atualizar
          </Button>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                console.log("[v0] CLIQUE DO BOTÃO DETECTADO! Event:", e.type)
                console.log("[v0] Estado atual - unread:", unread, "markingAllRead:", markingAllRead)
                markAllRead()
              }}
              disabled={markingAllRead}
              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-7 min-w-0 whitespace-nowrap"
            >
              {markingAllRead ? "Marcando..." : "Marcar lidas"}
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
          <DropdownMenuLabel className="p-0">Notificações</DropdownMenuLabel>
          <div className="text-xs text-muted-foreground">{unread} não lida(s)</div>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-[360px]">
          <div className="px-1 py-1">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">Sem notificações.</div>
            ) : (
              items.map((n) => {
                const tone =
                  n.type === "error"
                    ? "bg-red-50"
                    : n.type === "victory"
                      ? "bg-emerald-50"
                      : n.type === "agendamento"
                        ? "bg-sky-50"
                        : n.type === "followup"
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
                            n.type === "error" ? "text-red-700 font-medium" : "",
                            n.type === "victory" ? "text-emerald-700 font-medium" : "font-medium",
                          )}
                        >
                          {n.title ?? n.type}
                        </div>
                        {n.description ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[280px]">{n.description}</div>
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
            {items.length > 0 ? `Mostrando ${items.length} notificações` : "Nenhuma notificação"}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

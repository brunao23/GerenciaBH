"use client"

import { useEffect, useRef, useState } from "react"
import { supabaseClient } from "@/lib/supabase/client"
import { isSemanticErrorText, isVictoryText } from "@/lib/notifications/detect"
import { initAudioOnUserGesture, playSound } from "@/lib/notifications/sounds"
import { useToast } from "@/hooks/use-toast"
import { Button } from "./ui/button"
import { Bell, BellOff } from "lucide-react"
import { useTenant } from "@/lib/contexts/TenantContext"

type PostgresChangePayload<T> = {
  schema: string
  table: string
  eventType: "INSERT" | "UPDATE" | "DELETE" | string
  new: T
  old?: T
}

type NotificationRow = {
  id?: string
  type?: string
  title?: string | null
  description?: string | null
  message?: string | null
  read?: boolean
}

function getChatHistoriesTableCandidates(tenantPrefix: string) {
  const candidates = [
    `${tenantPrefix}n8n_chat_histories`,
    `${tenantPrefix}_n8n_chat_histories`,
    `${tenantPrefix}_chat_histories`,
    `${tenantPrefix}chat_histories`,
    `${tenantPrefix}_chat_history`,
    `${tenantPrefix}chat_history`,
  ]
  return Array.from(new Set(candidates))
}

function mapNotificationTone(type: string | undefined): "message" | "error" | "victory" {
  const value = String(type || "").toLowerCase()
  if (value.includes("erro") || value.includes("error")) return "error"
  if (value.includes("victory") || value.includes("ganho") || value.includes("convers")) return "victory"
  return "message"
}

export default function NotificationCenter() {
  const { toast } = useToast()
  const { tenant } = useTenant()
  const [supa, setSupa] = useState<ReturnType<typeof supabaseClient> | null>(null)
  const [muted, setMuted] = useState(false)
  const mounted = useRef(false)
  const seenSystemNotifications = useRef<Set<string>>(new Set())
  const channelScope = useRef(`center-${Math.random().toString(36).slice(2, 10)}`)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    try {
      const client = supabaseClient()
      setSupa(client)
    } catch (error) {
      console.error("[notification-center] Failed to initialize Supabase client:", error)
      return
    }

    initAudioOnUserGesture()

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!supa || !tenant?.prefix) return

    const chatHistoryTables = getChatHistoriesTableCandidates(tenant.prefix)
    const agendamentosTable = `${tenant.prefix}_agendamentos`
    const followNormalTable = `${tenant.prefix}_follow_normal`
    const notificationsTable = `${tenant.prefix}_notifications`

    const chatChannels = chatHistoryTables.map((table) =>
      supa
        .channel(`realtime:${channelScope.current}:${table}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table }, (payload: PostgresChangePayload<any>) => {
          const row = payload.new
          const message = row?.message ?? {}
          const raw = message.content ?? message.text ?? ""
          const type = String(message.type ?? "").toLowerCase()
          const isErr = isSemanticErrorText({ text: raw, type })
          const isWin = isVictoryText(raw)

          const sessionId = row?.session_id ?? "sessao"
          let title = "Nova mensagem"
          let sound: "message" | "error" | "victory" = "message"
          if (isErr) {
            title = "Mensagem de erro"
            sound = "error"
          } else if (isWin) {
            title = "Mensagem de vitoria"
            sound = "victory"
          }

          toast({
            title,
            description: isErr ? raw : isWin ? raw : `Sessao: ${sessionId}`,
            variant: isErr ? "destructive" : "default",
          })

          if (!muted) {
            playSound(sound)
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: isErr || isWin ? raw : `Sessao: ${sessionId}` })
          }
        })
        .subscribe(),
    )

    const chAg = supa
      .channel(`realtime:${channelScope.current}:${agendamentosTable}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: agendamentosTable },
        (payload: PostgresChangePayload<any>) => {
          const r = payload.new
          const nome = r?.nome_aluno ?? r?.nome_responsavel ?? "Novo agendamento"
          const dia = r?.dia ?? ""
          const horario = r?.horario ?? ""
          const body = `${nome} - ${dia} ${horario}`.trim()

          toast({
            title: "Novo agendamento",
            description: body,
          })

          if (!muted) {
            playSound("agendamento")
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("Novo agendamento", { body })
          }
        },
      )
      .subscribe()

    const chFollow = supa
      .channel(`realtime:${channelScope.current}:${followNormalTable}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: followNormalTable },
        (payload: PostgresChangePayload<any>) => {
          const r = payload.new
          const numero = r?.numero ?? "sem numero"
          const etapa = r?.etapa ? ` - etapa ${r.etapa}` : ""
          const body = `${numero}${etapa}`

          toast({
            title: "Novo follow-up",
            description: body,
          })

          if (!muted) {
            playSound("followup")
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("Novo follow-up", { body })
          }
        },
      )
      .subscribe()

    const chSystem = supa
      .channel(`realtime:${channelScope.current}:${notificationsTable}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: notificationsTable },
        (payload: PostgresChangePayload<NotificationRow>) => {
          const row = payload.new
          if (!row || row.read) return

          const id = String(row.id || "")
          if (id) {
            if (seenSystemNotifications.current.has(id)) {
              return
            }
            seenSystemNotifications.current.add(id)
          }

          const title = row.title || "Nova atualizacao da plataforma"
          const description = row.description || row.message || "Voce recebeu um novo aviso."
          const tone = mapNotificationTone(row.type)

          toast({
            title,
            description,
            variant: tone === "error" ? "destructive" : "default",
          })

          if (!muted) {
            if (tone === "error") {
              playSound("error")
            } else if (tone === "victory") {
              playSound("victory")
            } else {
              playSound("message")
            }
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: description })
          }
        },
      )
      .subscribe()

    return () => {
      chatChannels.forEach((channel) => supa.removeChannel(channel))
      supa.removeChannel(chAg)
      supa.removeChannel(chFollow)
      supa.removeChannel(chSystem)
    }
  }, [supa, toast, muted, tenant])

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <Button
        onClick={() => setMuted((m) => !m)}
        size="icon"
        variant={muted ? "secondary" : "default"}
        className={muted ? "border border-border" : "bg-accent-green text-black hover:bg-accent-green/90"}
        title={muted ? "Sons desativados" : "Sons ativados"}
        aria-label={muted ? "Sons desativados" : "Sons ativados"}
      >
        {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </Button>
    </div>
  )
}

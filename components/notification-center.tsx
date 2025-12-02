"use client"

import { useEffect, useRef, useState } from "react"
import { supabaseClient } from "@/lib/supabase/client"
import { isSemanticErrorText, isVictoryText } from "@/lib/notifications/detect"
import { initAudioOnUserGesture, playSound } from "@/lib/notifications/sounds"
import { useToast } from "@/hooks/use-toast"
import { Button } from "./ui/button"
import { Bell, BellOff } from "lucide-react"

type PostgresChangePayload<T> = {
  schema: string
  table: string
  eventType: "INSERT" | "UPDATE" | "DELETE" | string
  new: T
  old?: T
}

export default function NotificationCenter() {
  const { toast } = useToast()
  const [supa, setSupa] = useState<ReturnType<typeof supabaseClient> | null>(null)
  const [muted, setMuted] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    try {
      const client = supabaseClient()
      setSupa(client)
    } catch (error) {
      console.error("[v0] Failed to initialize Supabase client:", error)
      return
    }

    initAudioOnUserGesture()
  }, [])

  useEffect(() => {
    if (!supa) return

    // Novas mensagens
    const chChats = supa
      .channel("realtime:robson_voxn8n_chat_histories")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "robson_voxn8n_chat_histories" },
        (payload: PostgresChangePayload<any>) => {
          const row = payload.new
          const message = row?.message ?? {}
          const raw = message.content ?? message.text ?? ""
          const type = String(message.type ?? "").toLowerCase()
          const isErr = isSemanticErrorText({ text: raw, type })
          const isWin = isVictoryText(raw)

          const sessionId = row?.session_id ?? "sessão"
          let title = "Nova mensagem"
          let sound: "message" | "error" | "victory" = "message"
          if (isErr) {
            title = "Mensagem de ERRO"
            sound = "error"
          } else if (isWin) {
            title = "Mensagem de VITÓRIA"
            sound = "victory"
          }

          toast({
            title,
            description: isErr ? raw : isWin ? raw : `Sessão: ${sessionId}`,
            variant: isErr ? "destructive" : "default",
          })
          if (!muted) playSound(sound)
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: isErr || isWin ? raw : `Sessão: ${sessionId}` })
          }
        },
      )
      .subscribe()

    // Novos agendamentos
    const chAg = supa
      .channel("realtime:robson_vox_agendamentos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "robson_vox_agendamentos" },
        (payload: PostgresChangePayload<any>) => {
          const r = payload.new
          const nome = r?.nome_aluno ?? r?.nome_responsavel ?? "Novo agendamento"
          const dia = r?.dia ?? ""
          const horario = r?.horario ?? ""
          toast({
            title: "Novo agendamento",
            description: `${nome} • ${dia} ${horario}`.trim(),
          })
          if (!muted) playSound("agendamento")
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Novo agendamento", { body: `${nome} • ${dia} ${horario}`.trim() })
          }
        },
      )
      .subscribe()

    // Follow-ups
    const chFollow = supa
      .channel("realtime:robson_vox_folow_normal")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "robson_vox_folow_normal" },
        (payload: PostgresChangePayload<any>) => {
          const r = payload.new
          const numero = r?.numero ?? "sem número"
          const etapa = r?.etapa ? ` • etapa ${r.etapa}` : ""
          toast({
            title: "Novo follow-up",
            description: `${numero}${etapa}`,
          })
          if (!muted) playSound("followup")
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Novo follow-up", { body: `${numero}${etapa}` })
          }
        },
      )
      .subscribe()

    return () => {
      supa.removeChannel(chChats)
      supa.removeChannel(chAg)
      supa.removeChannel(chFollow)
    }
  }, [supa, toast, muted])

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <Button
        onClick={() => setMuted((m) => !m)}
        size="icon"
        variant={muted ? "secondary" : "default"}
        title={muted ? "Sons desativados" : "Sons ativados"}
        aria-label={muted ? "Sons desativados" : "Sons ativados"}
      >
        {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </Button>
    </div>
  )
}

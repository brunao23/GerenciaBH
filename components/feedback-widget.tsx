"use client"

import { useState } from "react"
import { MessageCircle, Send } from "lucide-react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("geral")
  const [contact, setContact] = useState("")
  const [message, setMessage] = useState("")

  const resetForm = () => {
    setSubject("")
    setCategory("geral")
    setContact("")
    setMessage("")
  }

  const handleSubmit = async () => {
    if (message.trim().length < 10) {
      toast.error("Descreva seu feedback com pelo menos 10 caracteres.")
      return
    }

    setSending(true)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          contact: contact.trim(),
          message: message.trim(),
          page: pathname,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao enviar feedback")
      }

      toast.success("Feedback enviado com sucesso.")
      resetForm()
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel enviar agora.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-accent-green text-black hover:bg-accent-green/90 shadow-[0_10px_30px_rgba(34,197,94,0.22)]">
            <MessageCircle className="h-4 w-4 mr-2" />
            Enviar feedback
          </Button>
        </DialogTrigger>
        <DialogContent className="border-accent-green/30 bg-card/95 backdrop-blur-xl sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Feedback da plataforma</DialogTitle>
            <DialogDescription>
              Envie sugestoes, bugs ou melhorias. O time admin recebe essas informacoes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Ajuste no disparo Meta"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="ux">Experiencia / Layout</SelectItem>
                    <SelectItem value="integracao">Integracao</SelectItem>
                    <SelectItem value="melhoria">Nova funcionalidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contato (opcional)</Label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email ou WhatsApp para retorno"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva com detalhes o que voce quer melhorar."
                className="min-h-[150px]"
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={sending || message.trim().length < 10}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

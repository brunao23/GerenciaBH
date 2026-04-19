"use client"

import { useEffect, useState } from "react"
import { UserPlus, Trash2, RefreshCw, Instagram, Copy, Check } from "lucide-react"

interface Role {
  id: string
  name: string
  role: string
}

interface ConnectedUnit {
  id: string
  name: string
  prefix: string
  metaInstagramAccountId?: string
  metaInstagramUserId?: string
  metaInstagramUsername?: string
  metaInstagramName?: string
}

export default function InstagramTestersPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [units, setUnits] = useState<ConnectedUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [userId, setUserId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [testersRes, unitsRes] = await Promise.all([
        fetch("/api/admin/meta/instagram/testers"),
        fetch("/api/admin/units"),
      ])
      const testersData = await testersRes.json()
      const unitsData = await unitsRes.json()

      if (testersData.success) {
        setRoles(testersData.roles.filter((r: Role) => r.role === "instagram_testers"))
      } else {
        setError(testersData.error)
      }

      if (unitsData.units) {
        const connected: ConnectedUnit[] = unitsData.units
          .filter((u: any) => u.metadata?.messaging?.metaInstagramAccountId)
          .map((u: any) => ({
            id: u.id,
            name: u.name,
            prefix: u.prefix,
            metaInstagramAccountId: u.metadata.messaging.metaInstagramAccountId,
            metaInstagramUserId: u.metadata.messaging.metaInstagramUserId,
            metaInstagramUsername: u.metadata.messaging.metaInstagramUsername,
            metaInstagramName: u.metadata.messaging.metaInstagramName,
          }))
        setUnits(connected)
      }
    } catch {
      setError("Erro ao carregar dados")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleAdd() {
    const id = userId.trim()
    if (!id) return
    setAdding(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/admin/meta/instagram/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSuccess("Testador adicionado. O usuário precisa aceitar o convite no Instagram.")
      setUserId("")
      await loadData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(uid: string) {
    setRemoving(uid)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/admin/meta/instagram/testers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSuccess("Testador removido.")
      await loadData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRemoving(null)
    }
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <Instagram className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Testadores Instagram</h1>
            <p className="text-xs text-muted-foreground">Gerenciar quem pode testar o login Instagram do app</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Adicionar testador */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-foreground">Adicionar Testador</h2>
        <p className="text-xs text-muted-foreground">
          Insira o <strong>Instagram Business Account ID</strong> do usuário (coluna &ldquo;Account ID&rdquo; abaixo). Após adicionar, o usuário precisa aceitar o convite em{" "}
          <a
            href="https://www.instagram.com/developer/api/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            instagram.com/developer/api/portal
          </a>
          .
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Ex: 17841430981795596"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !userId.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            {adding ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>

      {/* Contas Instagram conectadas no sistema */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-foreground">
          Contas Instagram Conectadas no Sistema
        </h2>
        <p className="text-xs text-muted-foreground">
          Unidades com Instagram conectado — copie o Account ID para adicionar como testador.
        </p>
        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Nenhuma unidade com Instagram conectado.</p>
        ) : (
          <div className="divide-y divide-border">
            {units.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{unit.name}</p>
                  {unit.metaInstagramUsername && (
                    <p className="text-xs text-muted-foreground">@{unit.metaInstagramUsername}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono">
                    Account ID: {unit.metaInstagramAccountId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyId(unit.metaInstagramAccountId!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    {copied === unit.metaInstagramAccountId ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copiar ID
                  </button>
                  <button
                    onClick={() => setUserId(unit.metaInstagramAccountId!)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    Usar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Testadores ativos */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-foreground">
          Testadores Ativos ({roles.length})
        </h2>
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Carregando...</p>
        ) : roles.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Nenhum testador cadastrado.</p>
        ) : (
          <div className="divide-y divide-border">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{role.name || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">ID: {role.id}</p>
                </div>
                <button
                  onClick={() => handleRemove(role.id)}
                  disabled={removing === role.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-destructive border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  {removing === role.id ? "Removendo..." : "Remover"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

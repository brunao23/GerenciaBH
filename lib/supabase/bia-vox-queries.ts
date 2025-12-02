import { createClient } from "@supabase/supabase-js"

// Function to create a Supabase client
function createRobsonVoxSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(supabaseUrl, supabaseKey)
}

// Tipos para as tabelas robson_vox_*
export interface RobsonVoxAgendamento {
  id: number
  created_at: string
  nome_responsavel?: string
  nome_aluno?: string
  horario?: string
  dia?: string
  observacoes?: string
  contato?: string
  status?: string
}

export interface RobsonVoxNotification {
  id: string
  created_at: string
  type: "message" | "error" | "agendamento" | "followup" | "victory"
  title?: string
  description?: string
  source_table?: string
  source_id?: string
  session_id?: string
  numero?: string
  read: boolean
}

export interface RobsonVoxUser {
  id: string
  email: string
  password_hash: string
  name?: string
  created_at: string
  updated_at: string
}

export interface RobsonVoxFollowup {
  id: string
  id_closer: string
  numero?: string
  estagio?: string
  mensagem_1?: string
  mensagem_2?: string
  mensagem_3?: string
  mensagem_4?: string
  mensagem_5?: string
  key?: string
  instancia?: string
}

export interface RobsonVoxFolowNormal {
  id: string
  numero?: string
  etapa?: number
  last_mensager?: string
  tipo_de_contato?: string
}

export interface RobsonVoxKnowbase {
  id: number
  content?: string
  metadata?: any
  embedding?: any
}

export interface RobsonVoxChatHistory {
  id: number
  session_id: string
  message: any
}

// Queries para robson_vox_agendamentos
export const robsonVoxAgendamentosQueries = {
  getAll: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_agendamentos")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxAgendamento[]
  },

  getById: async (id: number) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_agendamentos").select("*").eq("id", id).single()

    if (error) throw error
    return data as RobsonVoxAgendamento
  },

  create: async (agendamento: Omit<RobsonVoxAgendamento, "id" | "created_at">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_agendamentos").insert(agendamento).select().single()

    if (error) throw error
    return data as RobsonVoxAgendamento
  },

  update: async (id: number, updates: Partial<RobsonVoxAgendamento>) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_agendamentos").update(updates).eq("id", id).select().single()

    if (error) throw error
    return data as RobsonVoxAgendamento
  },

  delete: async (id: number) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { error } = await supabase.from("robson_vox_agendamentos").delete().eq("id", id)

    if (error) throw error
  },

  getByStatus: async (status: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_agendamentos")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxAgendamento[]
  },

  getByContato: async (contato: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_agendamentos")
      .select("*")
      .eq("contato", contato)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxAgendamento[]
  },
}

// Queries para robson_vox_notifications
export const robsonVoxNotificationsQueries = {
  getAll: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_notifications")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxNotification[]
  },

  getUnread: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_notifications")
      .select("*")
      .eq("read", false)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxNotification[]
  },

  create: async (notification: Omit<RobsonVoxNotification, "id" | "created_at">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_notifications").insert(notification).select().single()

    if (error) throw error
    return data as RobsonVoxNotification
  },

  markAsRead: async (id: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_notifications")
      .update({ read: true })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as RobsonVoxNotification
  },

  markAllAsRead: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { error } = await supabase.from("robson_vox_notifications").update({ read: true }).eq("read", false)

    if (error) throw error
  },

  getByType: async (type: RobsonVoxNotification["type"]) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_notifications")
      .select("*")
      .eq("type", type)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as RobsonVoxNotification[]
  },
}

// Queries para robson_vox_followup
export const robsonVoxFollowupQueries = {
  getAll: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_followup").select("*")

    if (error) throw error
    return data as RobsonVoxFollowup[]
  },

  getByNumero: async (numero: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_followup").select("*").eq("numero", numero)

    if (error) throw error
    return data as RobsonVoxFollowup[]
  },

  getByCloser: async (id_closer: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_followup").select("*").eq("id_closer", id_closer)

    if (error) throw error
    return data as RobsonVoxFollowup[]
  },

  create: async (followup: Omit<RobsonVoxFollowup, "id">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_followup").insert(followup).select().single()

    if (error) throw error
    return data as RobsonVoxFollowup
  },

  update: async (id: string, updates: Partial<RobsonVoxFollowup>) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_followup").update(updates).eq("id", id).select().single()

    if (error) throw error
    return data as RobsonVoxFollowup
  },
}

// Queries para robson_vox_folow_normal
export const robsonVoxFolowNormalQueries = {
  getAll: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_folow_normal")
      .select("*")
      .order("last_mensager", { ascending: false })

    if (error) throw error
    return data as RobsonVoxFolowNormal[]
  },

  getByNumero: async (numero: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_folow_normal").select("*").eq("numero", numero).single()

    if (error) throw error
    return data as RobsonVoxFolowNormal
  },

  create: async (folow: Omit<RobsonVoxFolowNormal, "id">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_folow_normal").insert(folow).select().single()

    if (error) throw error
    return data as RobsonVoxFolowNormal
  },

  updateEtapa: async (numero: string, etapa: number) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_vox_folow_normal")
      .update({
        etapa,
        last_mensager: new Date().toISOString(),
      })
      .eq("numero", numero)
      .select()
      .single()

    if (error) throw error
    return data as RobsonVoxFolowNormal
  },
}

// Queries para robson_vox_knowbase
export const robsonVoxKnowbaseQueries = {
  getAll: async () => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_knowbase").select("*")

    if (error) throw error
    return data as RobsonVoxKnowbase[]
  },

  search: async (query: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_knowbase").select("*").textSearch("content", query)

    if (error) throw error
    return data as RobsonVoxKnowbase[]
  },

  create: async (knowbase: Omit<RobsonVoxKnowbase, "id">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_vox_knowbase").insert(knowbase).select().single()

    if (error) throw error
    return data as RobsonVoxKnowbase
  },
}

// Queries para robson_voxn8n_chat_histories
export const robsonVoxChatHistoriesQueries = {
  getBySessionId: async (session_id: string) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase
      .from("robson_voxn8n_chat_histories")
      .select("*")
      .eq("session_id", session_id)
      .order("id", { ascending: true })

    if (error) throw error
    return data as RobsonVoxChatHistory[]
  },

  create: async (chat: Omit<RobsonVoxChatHistory, "id">) => {
    const supabase = createRobsonVoxSupabaseClient()
    const { data, error } = await supabase.from("robson_voxn8n_chat_histories").insert(chat).select().single()

    if (error) throw error
    return data as RobsonVoxChatHistory
  },
}

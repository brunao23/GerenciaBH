import { v4 as uuid } from "uuid"

export type Agendamento = {
  id: number
  created_at: string
  nome_responsavel: string | null
  nome_aluno: string | null
  horario: string | null
  dia: string | null
  observacoes: string | null
  contato: string | null
  status: string | null
}

export type SDR = {
  telefone: string | null
  nome: string | null
  email: string | null
  pontos: number | null
  temperatura: string | null
  resumo: string | null
  created_at: string
  enviado_closer: boolean | null
  id: string
}

export type Closer = {
  id: string
  status: string
  observacoes: string | null
  created_at: string
  followups_enviados: number
  last_update: string
  sdr_id: string | null
}

export type FollowUp = {
  id_closer: string
  numero: string | null
  estagio: string | null
  mensagem_1?: string | null
  mensagem_2?: string | null
  mensagem_3?: string | null
  mensagem_4?: string | null
  mensagem_5?: string | null
  key?: string | null
  instancia?: string | null
  id: string
}

export type ChatMessage = {
  role: "user" | "bot"
  content: string
  created_at: string
}

export type ChatSession = {
  session_id: string
  numero?: string | null
  messages: ChatMessage[]
  unread?: number
}

// Mock Agendamentos (public.Agendamentos)
export const mockAgendamentos: Agendamento[] = [
  {
    id: 1,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    nome_responsavel: "Maria Silva",
    nome_aluno: "João Silva",
    horario: "14:30:00",
    dia: "2025-08-12",
    observacoes: "Trazer documentos",
    contato: "+55 11 99999-1111",
    status: "pendente",
  },
  {
    id: 2,
    created_at: new Date().toISOString(),
    nome_responsavel: "Carlos Souza",
    nome_aluno: "Ana Souza",
    horario: "09:00:00",
    dia: "2025-08-13",
    observacoes: null,
    contato: "+55 21 98888-2222",
    status: "confirmado",
  },
  {
    id: 3,
    created_at: new Date().toISOString(),
    nome_responsavel: "Julia",
    nome_aluno: "Marcos",
    horario: "10:15:00",
    dia: "2025-08-14",
    observacoes: "Preferência WhatsApp",
    contato: "+55 31 97777-3333",
    status: "cancelado",
  },
]

// Mock SDRs (public.sofia_sdr)
export const mockSDRs: SDR[] = [
  {
    id: uuid(),
    telefone: "+55 11 91234-5678",
    nome: "Pedro Henrique",
    email: "pedro@example.com",
    pontos: 85,
    temperatura: "quente",
    resumo: "Interessado em matrícula para setembro.",
    created_at: new Date().toISOString(),
    enviado_closer: true,
  },
  {
    id: uuid(),
    telefone: "+55 21 99876-5432",
    nome: "Larissa",
    email: "larissa@example.com",
    pontos: 55,
    temperatura: "morno",
    resumo: "Precisa de informações adicionais sobre bolsas.",
    created_at: new Date().toISOString(),
    enviado_closer: false,
  },
]

// Mock Closers (public.sofia_closer) and Follow-ups (public.sofia_followup)
const closer1Id = uuid()
const closer2Id = uuid()

export const mockClosers: Closer[] = [
  {
    id: closer1Id,
    status: "em negociação",
    observacoes: "Aguardando confirmação da família.",
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    followups_enviados: 2,
    last_update: new Date().toISOString(),
    sdr_id: mockSDRs[0].id,
  },
  {
    id: closer2Id,
    status: "fechado",
    observacoes: "Matrícula concluída.",
    created_at: new Date(Date.now() - 7200_000).toISOString(),
    followups_enviados: 5,
    last_update: new Date().toISOString(),
    sdr_id: mockSDRs[1].id,
  },
]

export const mockFollowups: FollowUp[] = [
  {
    id: uuid(),
    id_closer: closer1Id,
    numero: mockSDRs[0].telefone,
    estagio: "inicial",
    mensagem_1: "Olá, aqui é do time de matrículas!",
    mensagem_2: "Você tem alguns minutos para falarmos?",
    instancia: "whatsapp-instancia-1",
    key: "FUP-1",
  },
  {
    id: uuid(),
    id_closer: closer1Id,
    numero: mockSDRs[0].telefone,
    estagio: "lembrete",
    mensagem_1: "Só passando para lembrar da nossa conversa.",
    instancia: "whatsapp-instancia-1",
    key: "FUP-2",
  },
  {
    id: uuid(),
    id_closer: closer2Id,
    numero: mockSDRs[1].telefone,
    estagio: "fechamento",
    mensagem_1: "Parabéns! Matrícula concluída.",
    instancia: "whatsapp-instancia-2",
    key: "FUP-3",
  },
]

// Expanded closers (join SDR + follow-ups)
export const mockClosersExpanded = mockClosers.map((c) => ({
  ...c,
  sdr: mockSDRs.find((s) => s.id === c.sdr_id) ?? null,
  followups: mockFollowups.filter((f) => f.id_closer === c.id),
}))

// Mock chat histories (public.sofia8n_chat_histories + public.sofian8n_chat_histories)
export const mockChats: {
  session_id: string
  numero?: string | null
  messages: ChatMessage[]
  unread?: number
}[] = [
  {
    session_id: "sessao-abc",
    numero: "+55 11 91234-5678",
    unread: 1,
    messages: [
      {
        role: "user",
        content: "Oi! Quero saber sobre matrícula.",
        created_at: new Date(Date.now() - 600000).toISOString(),
      },
      {
        role: "bot",
        content: "Claro! Para qual curso você tem interesse?",
        created_at: new Date(Date.now() - 580000).toISOString(),
      },
      { role: "user", content: "Curso de Inglês.", created_at: new Date(Date.now() - 560000).toISOString() },
    ],
  },
  {
    session_id: "sessao-xyz",
    numero: "+55 21 99876-5432",
    messages: [
      { role: "user", content: "Quais horários disponíveis?", created_at: new Date(Date.now() - 360000).toISOString() },
      {
        role: "bot",
        content: "Temos manhã e tarde. Qual prefere?",
        created_at: new Date(Date.now() - 350000).toISOString(),
      },
      { role: "user", content: "Tarde.", created_at: new Date(Date.now() - 340000).toISOString() },
      {
        role: "bot",
        content: "Perfeito! Posso agendar para amanhã às 14h?",
        created_at: new Date(Date.now() - 330000).toISOString(),
      },
    ],
  },
]

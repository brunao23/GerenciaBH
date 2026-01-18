/**
 * Serviço de Notificações Assertivo
 * Cria notificações para eventos importantes do sistema
 */

import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export type NotificationType =
  | 'followup_sent'
  | 'followup_active'
  | 'agendamento_created'
  | 'agendamento_confirmed'
  | 'ganho'
  | 'erro'
  | 'lead_paused'
  | 'lead_unpaused'
  | 'conversion'
  | 'new_lead'
  | 'conversao_baixa'

export interface CreateNotificationParams {
  type: NotificationType
  title: string
  message: string
  phoneNumber?: string
  leadName?: string
  metadata?: Record<string, any>
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tenant?: string // Para multi-tenancy
}

/**
 * Cria uma notificação no banco de dados
 */
export async function createNotification(params: CreateNotificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createBiaSupabaseServerClient()

    // Determina cor e ícone baseado no tipo
    const typeConfig = getNotificationTypeConfig(params.type)

    const notification = {
      type: params.type,
      title: params.title,
      message: params.message,
      phone_number: params.phoneNumber || null,
      lead_name: params.leadName || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      priority: params.priority || typeConfig.priority,
      color: typeConfig.color,
      icon: typeConfig.icon,
      read: false,
      created_at: new Date().toISOString()
    }

    // Usa tenant dinâmico ou fallback para vox_bh
    const tenant = params.tenant || 'vox_bh'
    const notificationsTable = `${tenant}_notifications`

    const { error } = await supabase
      .from(notificationsTable)
      .insert(notification)

    if (error) {
      console.error("[Notifications] Erro ao criar notificação:", error)
      return { success: false, error: error.message }
    }

    console.log(`[Notifications] Notificação criada: ${params.type} - ${params.title}`)
    return { success: true }
  } catch (error: any) {
    console.error("[Notifications] Erro ao criar notificação:", error)
    return { success: false, error: error?.message || "Erro desconhecido" }
  }
}

/**
 * Configuração visual por tipo de notificação
 */
function getNotificationTypeConfig(type: NotificationType): {
  color: string
  icon: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
} {
  const configs: Record<NotificationType, { color: string; icon: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> = {
    followup_sent: {
      color: '#3b82f6', // Azul
      icon: '📩',
      priority: 'medium'
    },
    followup_active: {
      color: '#8b5cf6', // Roxo
      icon: '⏰',
      priority: 'medium'
    },
    agendamento_created: {
      color: '#10b981', // Verde
      icon: '📅',
      priority: 'high'
    },
    agendamento_confirmed: {
      color: '#10b981', // Verde
      icon: '✅',
      priority: 'high'
    },
    ganho: {
      color: '#f59e0b', // Amarelo/Ouro
      icon: '🎉',
      priority: 'urgent'
    },
    erro: {
      color: '#ef4444', // Vermelho
      icon: '⚠️',
      priority: 'urgent'
    },
    lead_paused: {
      color: '#6b7280', // Cinza
      icon: '⏸️',
      priority: 'low'
    },
    lead_unpaused: {
      color: '#10b981', // Verde
      icon: '▶️',
      priority: 'low'
    },
    conversion: {
      color: '#f59e0b', // Amarelo/Ouro
      icon: '🏆',
      priority: 'high'
    },
    new_lead: {
      color: '#3b82f6', // Azul
      icon: '👤',
      priority: 'medium'
    },
    conversao_baixa: {
      color: '#ef4444', // Vermelho
      icon: '⚠️',
      priority: 'urgent'
    }
  }

  return configs[type] || {
    color: '#6b7280',
    icon: '🔔',
    priority: 'medium'
  }
}

/**
 * Helper: Notificação de follow-up enviado
 */
export async function notifyFollowUpSent(phoneNumber: string, leadName: string, attemptNumber: number) {
  return createNotification({
    type: 'followup_sent',
    title: 'Follow-up Enviado',
    message: `Follow-up enviado para ${leadName || phoneNumber} (tentativa ${attemptNumber})`,
    phoneNumber,
    leadName,
    metadata: { attemptNumber },
    priority: 'medium'
  })
}

/**
 * Helper: Notificação de lead entrando em follow-up
 */
export async function notifyFollowUpActive(phoneNumber: string, leadName: string, hoursSinceLastInteraction: number) {
  return createNotification({
    type: 'followup_active',
    title: 'Lead em Follow-up',
    message: `${leadName || phoneNumber} entrou em follow-up (sem resposta há ${Math.round(hoursSinceLastInteraction)}h)`,
    phoneNumber,
    leadName,
    metadata: { hoursSinceLastInteraction },
    priority: 'medium'
  })
}

/**
 * Helper: Notificação de agendamento criado
 */
export async function notifyAgendamentoCreated(phoneNumber: string, leadName: string, data: string, horario: string) {
  return createNotification({
    type: 'agendamento_created',
    title: 'Agendamento Criado',
    message: `Novo agendamento: ${leadName || phoneNumber} - ${data} às ${horario}`,
    phoneNumber,
    leadName,
    metadata: { data, horario },
    priority: 'high'
  })
}

/**
 * Helper: Notificação de ganho/conversão
 */
export async function notifyGanho(phoneNumber: string, leadName: string, motivo: string) {
  return createNotification({
    type: 'ganho',
    title: '🎉 Ganho!',
    message: `${leadName || phoneNumber} foi convertido! ${motivo ? `Motivo: ${motivo}` : ''}`,
    phoneNumber,
    leadName,
    metadata: { motivo },
    priority: 'urgent'
  })
}

/**
 * Helper: Notificação de erro
 */
export async function notifyErro(titulo: string, mensagem: string, metadata?: Record<string, any>) {
  return createNotification({
    type: 'erro',
    title: `⚠️ ${titulo}`,
    message: mensagem,
    metadata,
    priority: 'urgent'
  })
}


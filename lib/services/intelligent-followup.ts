/**
 * Serviço de Follow-up Inteligente
 * Analisa contexto da conversa e gera mensagens personalizadas
 */

interface ConversationContext {
  lastMessage: string
  lastMessageRole: 'user' | 'ai'
  lastInteractionAt: Date
  messageHistory: Array<{
    content: string
    role: 'user' | 'ai'
    timestamp: Date
  }>
  leadName?: string
  conversationTopic?: string
  sentiment?: 'positive' | 'neutral' | 'negative'
  hasAgendamento?: boolean
  hasInteresse?: boolean
}

interface FollowUpStage {
  intervalMinutes: number
  attemptNumber: number
  template: string
  context: string
}

// Intervalos de follow-up: 10min, 1h, 6h, 1d, 2d, 3d, 5d
const FOLLOW_UP_INTERVALS = [10, 60, 360, 1440, 2880, 4320, 7200] // em minutos

export class IntelligentFollowUpService {
  /**
   * Analisa o contexto da conversa e determina o melhor follow-up
   */
  analyzeContext(context: ConversationContext): {
    sentiment: 'positive' | 'neutral' | 'negative'
    topic: string
    urgency: 'low' | 'medium' | 'high'
    recommendedTemplate: string
  } {
    const lastMessage = context.lastMessage.toLowerCase()
    const fullConversation = context.messageHistory
      .map(m => m.content)
      .join(' ')
      .toLowerCase()

    // Análise de sentimento
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (/ótimo|excelente|gostei|interessado|perfeito|sim|quero|vou|combinado/i.test(lastMessage)) {
      sentiment = 'positive'
    } else if (/não quero|desistir|cancelar|não vou|não|não me interessa/i.test(lastMessage)) {
      sentiment = 'negative'
    }

    // Identifica tópico da conversa
    let topic = 'geral'
    if (/agendamento|agendar|horário|data|dia|hora/i.test(fullConversation)) {
      topic = 'agendamento'
    } else if (/preço|valor|custo|investimento|pagamento/i.test(fullConversation)) {
      topic = 'preço'
    } else if (/dúvida|pergunta|não entendi|explicar/i.test(fullConversation)) {
      topic = 'dúvida'
    } else if (/interesse|gostaria|quero saber|informação/i.test(fullConversation)) {
      topic = 'interesse'
    }

    // Determina urgência
    let urgency: 'low' | 'medium' | 'high' = 'medium'
    if (context.hasAgendamento || sentiment === 'positive') {
      urgency = 'high'
    } else if (sentiment === 'negative') {
      urgency = 'low'
    }

    // Seleciona template recomendado baseado no contexto
    const recommendedTemplate = this.selectTemplate(context, topic, sentiment)

    return {
      sentiment,
      topic,
      urgency,
      recommendedTemplate
    }
  }

  /**
   * Seleciona o template mais apropriado baseado no contexto
   */
  private selectTemplate(
    context: ConversationContext,
    topic: string,
    sentiment: 'positive' | 'neutral' | 'negative'
  ): string {
    const rawNameSelect = String(context.leadName || '').trim()
    const name = rawNameSelect
      ? (rawNameSelect.replace(/([a-z\u00C0-\u017E])([A-Z\u0178-\u024F])/g, '$1 $2').split(' ')[0].replace(/^(.)(.*)$/, (_, f, r) => f.toUpperCase() + r.toLowerCase()) || 'aí')
      : 'aí'
    const hoursSinceLast = (Date.now() - context.lastInteractionAt.getTime()) / (1000 * 60 * 60)

    // Template baseado no tópico e sentimento
    if (topic === 'agendamento' && sentiment === 'positive') {
      return `Oi ${name}! Vi que conversamos sobre agendamento. Tudo certo para confirmarmos? Fico à disposição para ajustar qualquer coisa! 😊`
    }

    if (topic === 'preço') {
      return `Olá ${name}! Passando para saber se conseguiu analisar as informações que enviamos. Posso ajudar com alguma dúvida sobre valores ou condições? 💰`
    }

    if (topic === 'dúvida') {
      return `Oi ${name}! Vi que você tinha algumas dúvidas. Conseguiu esclarecer? Se precisar de mais alguma informação, é só falar! 📩`
    }

    if (sentiment === 'positive') {
      return `Oi ${name}! Passando aqui para ver se está tudo certo por aí. Ainda tem interesse? Fico à disposição! 😊`
    }

    if (hoursSinceLast < 1) {
      return `Oi ${name}! Vi que estávamos conversando agora há pouco. Tudo certo? Precisa de mais alguma informação?`
    }

    if (hoursSinceLast < 6) {
      return `Olá ${name}! Passando aqui para ver se conseguiu pensar melhor sobre o que conversamos. Estou à disposição para tirar qualquer dúvida!`
    }

    if (hoursSinceLast < 24) {
      return `Bom dia ${name}! 🌞 Passando aqui para retomar nossa conversa. Ainda tem interesse? Posso ajudar com algo específico?`
    }

    return `Oi ${name}, tudo bem? Faz alguns dias que conversamos. Queria saber se ainda faz sentido para você ou se mudou alguma coisa. Estou aqui! 💬`
  }

  /**
   * Gera mensagem de follow-up personalizada
   */
  generateFollowUpMessage(
    context: ConversationContext,
    attemptNumber: number
  ): string {
    const analysis = this.analyzeContext(context)
    const rawName = String(context.leadName || '').trim()
    const name = rawName
      ? (rawName.replace(/([a-z\u00C0-\u017E])([A-Z\u0178-\u024F])/g, '$1 $2').split(' ')[0].replace(/^(.)(.*)$/, (_, f, r) => f.toUpperCase() + r.toLowerCase()) || 'aí')
      : 'aí'
    const hoursSinceLast = Math.floor(
      (Date.now() - context.lastInteractionAt.getTime()) / (1000 * 60 * 60)
    )
    const daysSinceLast = Math.floor(hoursSinceLast / 24)

    // Mensagens baseadas no número da tentativa (7 etapas: 10min/1h/6h/1d/2d/3d/5d)
    switch (attemptNumber) {
      case 1: // 10 minutos — Primeiro contato
        return `Oi ${name}! Vi que estávamos conversando agora há pouco. Tudo certo por aí? Está precisando de mais alguma informação? 😊`

      case 2: // 1 hora — Relembrar conversa
        return `Olá ${name}! Passando aqui para ver se conseguiu pensar melhor sobre o que conversamos. Fico à disposição para tirar qualquer dúvida! 📩`

      case 3: // 6 horas — Acompanhamento
        return `${name}, preparei algumas informações adicionais que podem te ajudar. Quando tiver um tempinho, me chama que passo os detalhes! ✨`

      case 4: // 1 dia — Retomada do dia seguinte
        return daysSinceLast >= 1
          ? `Bom dia ${name}! 🌞 Retomando nossa conversa de ontem. Ainda posso te ajudar com algo específico?`
          : `Olá ${name}! Passando para retomar nossa conversa. Ainda tem interesse? Posso te ajudar com algo? 💬`

      case 5: // 2 dias — Reforço de contexto
        return `Oi ${name}, tudo bem? Passando para reforçar que ainda estou à disposição para continuar de onde paramos. Me avisa se quiser! 💬`

      case 6: // 3 dias — Tentativa final
        return `Oi ${name}, é minha última tentativa de contato. Se ainda tiver interesse ou precisar de algo, é só responder aqui. Estou à disposição! 🙌`

      case 7: // 5 dias — Encerramento automático
        return `${name}, estou encerrando seu atendimento por aqui. Se quiser retomar em qualquer momento, é só me chamar! 🙌`

      default:
        return this.selectTemplate(context, analysis.topic, analysis.sentiment)
    }
  }

  /**
   * Verifica se está dentro do horário comercial
   * Horário comercial: 8h às 18h, segunda a sexta
   */
  isBusinessHours(date: Date = new Date()): boolean {
    const hour = date.getHours()
    const day = date.getDay() // 0 = domingo, 6 = sábado

    // Finais de semana não são horário comercial
    if (day === 0 || day === 6) {
      return false
    }

    // Horário comercial: 8h às 18h
    return hour >= 8 && hour < 18
  }

  /**
   * Calcula o próximo horário de follow-up respeitando horário comercial
   */
  calculateNextFollowUpTime(
    lastInteractionAt: Date,
    attemptNumber: number
  ): Date | null {
    if (attemptNumber > FOLLOW_UP_INTERVALS.length) {
      return null // Não há mais tentativas
    }

    const intervalMinutes = FOLLOW_UP_INTERVALS[attemptNumber - 1]
    const nextTime = new Date(lastInteractionAt.getTime() + intervalMinutes * 60 * 1000)

    // Se o próximo horário não está em horário comercial, ajusta para o próximo horário comercial
    if (!this.isBusinessHours(nextTime)) {
      return this.adjustToBusinessHours(nextTime)
    }

    return nextTime
  }

  /**
   * Ajusta o horário para o próximo período comercial válido
   */
  private adjustToBusinessHours(date: Date): Date {
    const adjusted = new Date(date)
    const hour = adjusted.getHours()
    const day = adjusted.getDay()

    // Se for final de semana, vai para segunda-feira 8h
    if (day === 0 || day === 6) {
      const daysUntilMonday = day === 0 ? 1 : 2
      adjusted.setDate(adjusted.getDate() + daysUntilMonday)
      adjusted.setHours(8, 0, 0, 0)
      return adjusted
    }

    // Se for antes das 8h, ajusta para 8h do mesmo dia
    if (hour < 8) {
      adjusted.setHours(8, 0, 0, 0)
      return adjusted
    }

    // Se for depois das 18h, vai para 8h do próximo dia útil
    if (hour >= 18) {
      // Se for sexta, vai para segunda
      if (day === 5) {
        adjusted.setDate(adjusted.getDate() + 3)
      } else {
        adjusted.setDate(adjusted.getDate() + 1)
      }
      adjusted.setHours(8, 0, 0, 0)
      return adjusted
    }

    return adjusted
  }

  /**
   * Verifica se um follow-up deve ser enviado agora
   */
  shouldSendFollowUp(
    lastInteractionAt: Date,
    attemptNumber: number,
    isActive: boolean
  ): boolean {
    if (!isActive) {
      return false
    }

    if (!this.isBusinessHours()) {
      return false
    }

    const nextTime = this.calculateNextFollowUpTime(lastInteractionAt, attemptNumber)
    
    if (!nextTime) {
      return false
    }

    // Pode enviar se já passou do horário previsto
    return new Date() >= nextTime
  }
}

export { FOLLOW_UP_INTERVALS }


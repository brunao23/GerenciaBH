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

// Intervalos de follow-up: 10min, 1h, 6h, 12h, 24h, 26h, 72h, 90h
const FOLLOW_UP_INTERVALS = [10, 60, 360, 720, 1440, 1560, 4320, 5400] // em minutos
// 10min=10, 1h=60, 6h=360, 12h=720, 24h=1440, 26h=1560, 72h=4320, 90h=5400

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
    const name = context.leadName || 'aí'
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
    const name = context.leadName || 'aí'
    const hoursSinceLast = Math.floor(
      (Date.now() - context.lastInteractionAt.getTime()) / (1000 * 60 * 60)
    )
    const daysSinceLast = Math.floor(hoursSinceLast / 24)

    // Mensagens baseadas no número da tentativa
    switch (attemptNumber) {
      case 1: // 10 minutos
        return `Oi ${name}! Vi que estávamos conversando agora há pouco. Tudo certo por aí? Está precisando de mais alguma informação? 😊`
      
      case 2: // 1 hora
        return `Olá ${name}! Passando aqui para ver se conseguiu pensar melhor sobre o que conversamos. Fico à disposição para tirar qualquer dúvida! 📩`
      
      case 3: // 6 horas
        return `${name}, preparei algumas informações adicionais que podem te ajudar na decisão. Quando tiver um tempinho, me chama que passo os detalhes! ✨`
      
      case 4: // 12 horas
        return `Olá ${name}! Percebi que não recebi retorno ainda. Ainda tem interesse? Posso te ajudar com algo específico? 💬`
      
      case 5: // 24 horas
        return daysSinceLast === 1
          ? `Bom dia ${name}! 🌞 Passando aqui para retomar nossa conversa de ontem. Ainda tem interesse? Posso te ajudar com algo específico?`
          : `Bom dia ${name}! 🌞 Passando aqui para retomar nossa conversa. Ainda tem interesse?`
      
      case 6: // 26 horas (1 dia e 2 horas)
        return `Oi ${name}, tudo bem? Faz um dia que conversamos. Queria saber se ainda faz sentido para você ou se mudou alguma coisa. Estou aqui! 💬`
      
      case 7: // 72 horas (3 dias)
        return `Oi ${name}, tudo bem? Faz alguns dias que conversamos. Queria saber se ainda tem interesse ou se mudou alguma coisa. Estou à disposição! 🙌`
      
      case 8: // 90 horas (~4 dias)
        return `${name}, percebi que não conseguimos finalizar nossa conversa. Se ainda tiver interesse ou precisar de algo, pode me chamar. Estou à disposição! 🙌`
      
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


// Sistema de templates profissionais para follow-up automático
export interface MessageTemplate {
  id: string
  name: string
  type: "72h" | "24h" | "1h"
  template: (nome: string, data: string, horario: string, observacoes?: string) => string
  description: string
}

export const FOLLOW_UP_TEMPLATES: MessageTemplate[] = [
  // Templates para 72h antes
  {
    id: "72h_formal",
    name: "Formal - 72h",
    type: "72h",
    description: "Mensagem formal e profissional para lembrete de 3 dias",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `Olá ${nome}! 👋

Este é um lembrete de que você tem uma *visita agendada* na Bia Vox para *${data} às ${horario}*.

📍 *Detalhes da sua visita:*
• Data: ${data}
• Horário: ${horario}
• Local: Bia Vox - Centro Educacional
${observacoes ? `• Observações: ${observacoes}` : ""}

Estamos ansiosos para recebê-lo(a)! Se precisar reagendar ou tiver alguma dúvida, entre em contato conosco.

*Bia Vox - Sua educação é nossa prioridade!* 📚✨`,
  },
  {
    id: "72h_casual",
    name: "Casual - 72h",
    type: "72h",
    description: "Mensagem mais descontraída para lembrete de 3 dias",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `Oi ${nome}! 😊

Só passando para lembrar que você tem uma visita marcada aqui na Bia Vox!

🗓️ *Quando:* ${data} às ${horario}
📍 *Onde:* Bia Vox - Centro Educacional

${observacoes ? `💡 *Lembrete:* ${observacoes}\n\n` : ""}Qualquer coisa, é só dar um toque! Estamos aqui para ajudar.

Até breve! 🎯`,
  },

  // Templates para 24h antes
  {
    id: "24h_urgente",
    name: "Urgente - 24h",
    type: "24h",
    description: "Mensagem com tom de urgência para confirmação",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `🚨 *LEMBRETE IMPORTANTE* - ${nome}

Sua visita na Bia Vox é *AMANHÃ*!

⏰ *${data} às ${horario}*

Por favor, *CONFIRME* sua presença respondendo:
✅ "CONFIRMADO" - se você virá
❌ "REAGENDAR" - se precisa remarcar

${observacoes ? `📝 *Observação:* ${observacoes}\n\n` : ""}⚠️ *Importante:* Caso não possa comparecer, nos avise para disponibilizarmos a vaga para outros interessados.

*Bia Vox* - Te esperamos! 💪`,
  },
  {
    id: "24h_amigavel",
    name: "Amigável - 24h",
    type: "24h",
    description: "Mensagem amigável para confirmação",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `Oi ${nome}! 🌟

Lembrete carinhoso: sua visita na Bia Vox é *amanhã (${data}) às ${horario}*!

Você pode confirmar sua presença? É só responder:
• ✅ "Vou sim!" 
• 📅 "Preciso reagendar"

${observacoes ? `💭 *Lembrete:* ${observacoes}\n\n` : ""}Estamos ansiosos para te receber e mostrar tudo que preparamos para você!

*Bia Vox* - Educação que transforma! 🚀`,
  },

  // Templates para 1h antes
  {
    id: "1h_final",
    name: "Final - 1h",
    type: "1h",
    description: "Lembrete final com informações práticas",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `⏰ *ÚLTIMO LEMBRETE* - ${nome}

Sua visita na Bia Vox é *HOJE às ${horario}*!

📍 *Endereço:*
Bia Vox - Centro Educacional
[Inserir endereço completo aqui]

🚗 *Dicas importantes:*
• Chegue 10 minutos antes
• Traga um documento com foto
• Temos estacionamento disponível

${observacoes ? `📋 *Observação:* ${observacoes}\n\n` : ""}📞 *Contato de emergência:* [Inserir telefone]

*Nos vemos em breve!* 🎯`,
  },
  {
    id: "1h_motivacional",
    name: "Motivacional - 1h",
    type: "1h",
    description: "Mensagem motivacional para o último lembrete",
    template: (nome: string, data: string, horario: string, observacoes?: string) =>
      `🎉 *É HOJE, ${nome}!*

Sua visita na Bia Vox é às *${horario}*!

✨ *O que te espera:*
• Conhecer nossa metodologia única
• Conversar com nossos especialistas
• Descobrir seu potencial

📍 *Nos encontramos em:*
Bia Vox - Centro Educacional
[Inserir endereço]

${observacoes ? `💡 *Lembrete especial:* ${observacoes}\n\n` : ""}🚀 *Prepare-se para uma experiência transformadora!*

Até já! 💪`,
  },
]

export const TEMPLATE_VARIATIONS = {
  "72h": ["72h_formal", "72h_casual"],
  "24h": ["24h_urgente", "24h_amigavel"],
  "1h": ["1h_final", "1h_motivacional"],
}

export function getRandomTemplate(tipo: "72h" | "24h" | "1h"): MessageTemplate {
  const templateIds = TEMPLATE_VARIATIONS[tipo]
  const randomId = templateIds[Math.floor(Math.random() * templateIds.length)]
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === randomId)!
}

export function getTemplateById(id: string): MessageTemplate | undefined {
  return FOLLOW_UP_TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByType(tipo: "72h" | "24h" | "1h"): MessageTemplate[] {
  return FOLLOW_UP_TEMPLATES.filter((t) => t.type === tipo)
}

// Templates específicos por contexto
export const CONTEXT_TEMPLATES = {
  // Para agendamentos de matrícula
  matricula: {
    "72h": (nome: string, data: string, horario: string) =>
      `Olá ${nome}! 🎓

Lembrete: você tem um *atendimento para matrícula* agendado na Bia Vox para *${data} às ${horario}*.

📋 *Documentos necessários:*
• RG e CPF
• Comprovante de residência
• Histórico escolar (se aplicável)

Estamos preparados para te receber e esclarecer todas as dúvidas sobre nossos cursos!

*Bia Vox - Seu futuro começa aqui!* 🚀`,

    "24h": (nome: string, data: string, horario: string) =>
      `${nome}, sua *matrícula* na Bia Vox é amanhã! 📚

⏰ *${data} às ${horario}*

Não esqueça dos documentos:
✅ RG e CPF
✅ Comprovante de residência  
✅ Histórico escolar

Confirme sua presença respondendo esta mensagem!

*Bia Vox* - Te esperamos! 💪`,

    "1h": (nome: string, data: string, horario: string) =>
      `🎯 *${nome}, é HOJE!*

Sua matrícula na Bia Vox é às *${horario}*!

📍 Bia Vox - Centro Educacional
[Inserir endereço]

📞 Emergência: [Inserir telefone]

*Vamos juntos construir seu futuro!* ✨`,
  },

  // Para agendamentos de consultoria
  consultoria: {
    "72h": (nome: string, data: string, horario: string) =>
      `Olá ${nome}! 💼

Você tem uma *consultoria educacional* agendada na Bia Vox para *${data} às ${horario}*.

🎯 *O que vamos abordar:*
• Análise do seu perfil
• Melhores opções de curso
• Planejamento de carreira
• Oportunidades no mercado

Prepare suas dúvidas! Será um papo muito produtivo.

*Bia Vox - Orientação que faz a diferença!* 🌟`,

    "24h": (nome: string, data: string, horario: string) =>
      `${nome}, sua *consultoria* é amanhã! 🎯

⏰ *${data} às ${horario}*

💭 *Dica:* Pense nas suas metas profissionais e traga suas dúvidas sobre carreira!

Confirme sua presença para garantirmos o melhor atendimento.

*Bia Vox* - Seu sucesso é nosso objetivo! 🚀`,

    "1h": (nome: string, data: string, horario: string) =>
      `⚡ *Consultoria HOJE, ${nome}!*

Às *${horario}* na Bia Vox!

🧠 *Prepare-se para:*
• Descobrir seu potencial
• Definir seus objetivos
• Traçar seu plano de sucesso

📍 [Inserir endereço]
📞 [Inserir telefone]

*Vamos transformar seus sonhos em realidade!* 💪`,
  },
}

export function getContextTemplate(
  contexto: keyof typeof CONTEXT_TEMPLATES,
  tipo: "72h" | "24h" | "1h",
  nome: string,
  data: string,
  horario: string,
): string {
  const template = CONTEXT_TEMPLATES[contexto]?.[tipo]
  return template ? template(nome, data, horario) : getRandomTemplate(tipo).template(nome, data, horario)
}

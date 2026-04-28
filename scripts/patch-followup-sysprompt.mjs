import { readFileSync, writeFileSync } from 'fs'

const path = 'c:/Users/WINDOWS/Downloads/GerenciaBH/lib/services/agent-task-queue.service.ts'
let content = readFileSync(path, 'utf8')

// Anchor: line that says REGRA CRITICA DE REPETICAO - inject before it
const anchor = '"REGRA CRITICA DE REPETICAO: cada follow-up deve abordar o assunto de um angulo diferente.'
const idx = content.indexOf(anchor)

if (idx === -1) {
  console.log('ANCHOR FOR SYSTEM PROMPT NOT FOUND')
  process.exit(1)
}

const newSystemRule = `"[LEI INVIOLAVEL] PROIBIDO ABSOLUTO - LEMBRETE DE AGENDAMENTO: Este sistema de follow-up serve EXCLUSIVAMENTE para reengajar leads que nao responderam. NUNCA gere mensagem mencionando: lembrete, agendamento ja feito, horario marcado, consulta/visita/aula agendada, confirmacao de presenca/comparecimento, 'amanha voce tem', 'nao esqueca', 'confirme sua presenca', 'horario confirmado'. Foque APENAS em reengajar o interesse do lead. Se a conversa era sobre agendar, aborde o INTERESSE ou BENEFICIO do servico, nao o agendamento.",\n          `

const updated = content.slice(0, idx) + newSystemRule + content.slice(idx)
writeFileSync(path, updated, 'utf8')
console.log('SUCCESS - anti-reminder rule added to systemPrompt')

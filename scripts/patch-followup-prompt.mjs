import { readFileSync, writeFileSync } from 'fs'

const path = 'c:/Users/WINDOWS/Downloads/GerenciaBH/lib/services/agent-task-queue.service.ts'
let content = readFileSync(path, 'utf8')

// Anchor: the line after rule "3b." and before rule "4."
const anchor4 = '"4. NUNCA repita ou parafraseie mensagens que a IA ja enviou'
const idx = content.indexOf(anchor4)

if (idx === -1) {
  console.log('ANCHOR FOR RULE 4 NOT FOUND')
  process.exit(1)
}

const newRule = `      "[LEI INVIOLAVEL] PROIBIDO ABSOLUTO - LEMBRETE DE AGENDAMENTO: Este follow-up serve EXCLUSIVAMENTE para reengajar leads que nao responderam. NUNCA escreva sobre agendamentos ja feitos, horarios marcados, lembretes de consulta/visita/aula, confirmacao de presenca, 'amanha voce tem', 'seu agendamento', 'nao esqueca', 'confirme sua presenca', 'horario confirmado', 'agendamento marcado' ou qualquer variacao. Se o assunto da conversa era sobre marcar horario, foque no INTERESSE DO LEAD, nao no agendamento em si.",\n      `

const updated = content.slice(0, idx) + newRule + content.slice(idx)
writeFileSync(path, updated, 'utf8')
console.log('SUCCESS - anti-reminder rule added to followup prompt')

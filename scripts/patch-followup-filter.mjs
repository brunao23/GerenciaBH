import { readFileSync, writeFileSync } from 'fs'

const path = 'c:/Users/WINDOWS/Downloads/GerenciaBH/lib/services/agent-task-queue.service.ts'
let content = readFileSync(path, 'utf8')

// Patterns to add after "envio o link"
const anchor = '"envio o link",'
const idx = content.indexOf(anchor)

if (idx === -1) {
  console.log('ANCHOR NOT FOUND')
  process.exit(1)
}

const insertAfter = idx + anchor.length

const injection = `
    // BLOQUEIO ABSOLUTO: padroes de LEMBRETE DE AGENDAMENTO
    // Follow-up e para reengajar leads sem resposta - NAO e lembrete de agenda.
    // Se um lead agendado chegar aqui por bug, a mensagem NAO pode ter esse conteudo.
    "lembrete",
    "lembrar que",
    "lembrar voce",
    "seu agendamento",
    "sua consulta",
    "sua visita",
    "sua sessao",
    "sua aula",
    "seu horario",
    "horario marcado",
    "horario agendado",
    "horario confirmado",
    "data marcada",
    "data agendada",
    "data confirmada",
    "confirmar sua presenca",
    "confirmar presenca",
    "confirmar comparecimento",
    "confirmar seu agendamento",
    "confirme sua presenca",
    "confirme o agendamento",
    "confirme seu horario",
    "voce tem um agendamento",
    "voce tem uma consulta",
    "voce tem uma visita",
    "voce tem uma aula",
    "amanha voce tem",
    "amanha temos",
    "agendado para amanha",
    "agendamento confirmado",
    "agendamento marcado",
    "agendamento realizado",
    "nao esqueca",
    "nao esqueca do",
    "nao esqueca da",
    "fique atento ao horario",`

const updated = content.slice(0, insertAfter) + injection + content.slice(insertAfter)
writeFileSync(path, updated, 'utf8')
console.log('SUCCESS - blocked reminder patterns added to isLikelyGenericFollowup')

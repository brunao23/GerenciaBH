## Motivação e Contexto
Por que essa mudança é necessária? Qual problema ela resolve? Se ela corrige uma Issue, por favor linke-a aqui.

## Descrição
Descreva em detalhes o que foi alterado.

## Impacto na Arquitetura (CRÍTICO)
Verifique os itens abaixo antes de solicitar review:
- [ ] O código respeita o limite arquitetural Multi-Tenant? (Uso de `getTablesForTenant`).
- [ ] Nenhuma chave ou secret foi commitada ou enviada ao Frontend?
- [ ] O projeto compila corretamente no TypeScript estrito (`npm run build` / `npx tsc --noEmit`) sem uso de `any`?
- [ ] A regra de Pausa no Webhook (Early Pause Check) foi mantida intacta?
- [ ] A sincronização com Google Calendar funciona adequadamente caso a alteração toque no fluxo de agendamentos (`schedule_appointment`, etc)?

## Como Testar
Passo a passo de como o revisor deve testar sua mudança localmente.
1. 
2. 
3. 

## Screenshots (Se aplicável UI)
(Cole os prints do painel aqui)

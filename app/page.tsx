"use client"

import Link from "next/link"

const heroMetrics = [
  { label: "Tempo de resposta", value: "Atendimento em minutos", tone: "text-cyan-300" },
  { label: "Capacidade de conversão", value: "Qualificação contínua", tone: "text-emerald-300" },
  { label: "Canais ativos", value: "WhatsApp, Instagram Direct e comentários", tone: "text-violet-300" },
]

const outcomePillars = [
  {
    title: "Mais leads aproveitados",
    description:
      "Sua operação para de perder oportunidade por demora ou conversa desconexa e mantém o lead avançando.",
  },
  {
    title: "Mais reuniões de qualidade",
    description:
      "A jornada de qualificação filtra melhor e entrega para o time comercial contatos com maior chance de fechamento.",
  },
  {
    title: "Mais eficiência para escalar",
    description:
      "Você cresce sem inflar operação, com automação consistente e governança por unidade em um mesmo sistema.",
  },
]

const strongArguments = [
  {
    title: "Você responde rápido sem aumentar equipe",
    description:
      "A IA sustenta o primeiro atendimento e reduz gargalo em picos de demanda sem perder qualidade de conversa.",
  },
  {
    title: "Você transforma Instagram em canal de venda",
    description:
      "Direct e comentários entram no fluxo comercial com contexto para acelerar resposta, qualificação e conversão.",
  },
  {
    title: "Você reduz retrabalho e ruído operacional",
    description:
      "Agenda, CRM e conversa trabalham juntos. O time atua com clareza do próximo passo, sem apagar incêndio.",
  },
  {
    title: "Você ganha previsibilidade comercial",
    description:
      "Follow up contextual e operação por etapa criam rotina de execução estável para gerar receita recorrente.",
  },
]

const featureGrid = [
  {
    title: "Atendimento autônomo com contexto real",
    description:
      "Agentes de IA entendem o histórico completo da conversa e respondem com continuidade entre canais.",
  },
  {
    title: "Instagram Direct e comentários no mesmo fluxo",
    description:
      "Interações do Instagram entram com contexto no CRM para o time atuar sem troca de ferramenta.",
  },
  {
    title: "Qualificação comercial estruturada",
    description:
      "A conversa evolui por etapas de descoberta para elevar qualidade de lead antes da proposta.",
  },
  {
    title: "Handoff humano sem perda de histórico",
    description:
      "Quando o consultor assume, todo o contexto já está organizado para acelerar fechamento.",
  },
  {
    title: "Follow up inteligente por etapa",
    description:
      "Retomadas acontecem no momento certo, com mensagem coerente ao ponto exato da jornada.",
  },
  {
    title: "Agenda integrada com validação prévia",
    description:
      "Horários ocupados não são oferecidos. O sistema prioriza disponibilidade real para evitar falhas.",
  },
  { title: "Gestão multi tenant com governança", description: "Cada operação mantém credenciais, fluxos e configurações isoladas com visão administrativa central." },
]

const workflowSteps = [
  {
    step: "01",
    title: "Captura",
    description: "Leads chegam por WhatsApp e Instagram e entram no CRM com identificação de canal e contexto.",
  },
  {
    step: "02",
    title: "Qualificação",
    description: "A IA conduz a conversa com critérios comerciais e prepara o avanço para agendamento ou proposta.",
  },
  {
    step: "03",
    title: "Conversão",
    description: "Com agenda validada e histórico limpo, o time atua com velocidade e precisão para fechar.",
  },
]

const trustSignals = [
  "WhatsApp",
  "Instagram Direct",
  "Instagram comentários",
  "CRM integrado",
  "Agenda inteligente",
  "Follow up contextual",
  "Operação por unidade",
  "Governança central",
]

export default function HomePage() {
  return (
    <div className="relative min-h-[100svh] overflow-x-hidden bg-background text-pure-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 right-[-8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.26),_transparent_68%)] blur-3xl animate-float-slow" />
        <div className="absolute bottom-[-18%] left-[-12%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.18),_transparent_68%)] blur-3xl animate-float" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.04)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[size:88px_88px] opacity-25" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold shadow-lg shadow-emerald-500/25">
            G
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">GerencIA</div>
            <div className="text-[11px] uppercase tracking-[0.35em] text-text-gray">Genial Labs AI</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-text-gray transition hover:border-white/30 hover:text-pure-white"
          >
            Entrar
          </Link>
          <Link
            href="/admin/login"
            className="rounded-full bg-gradient-to-r from-accent-green to-dark-green px-4 py-2 text-xs font-semibold text-primary-black shadow-lg shadow-emerald-500/25 transition hover:scale-[1.02]"
          >
            Painel administrativo
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-14 px-6 pb-16 pt-4">
        <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-accent-green">
              Plataforma premium de atendimento e conversão
            </span>

            <div className="space-y-4">
              <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] text-pure-white md:text-5xl xl:text-6xl">
                Transforme WhatsApp e Instagram em uma máquina de aquisição, qualificação e conversão.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text-gray md:text-lg">
                GerencIA foi construída para operação comercial real. A plataforma responde rápido, mantém contexto, agenda com precisão e entrega controle total da jornada até a venda.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-white/20 transition hover:scale-[1.02]"
              >
                Acessar painel
              </Link>
              <Link
                href="/admin/login"
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-pure-white transition hover:border-white/35"
              >
                Gerenciar unidades
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-white/10 bg-black/[0.20] px-3 py-1.5 text-xs font-medium text-text-gray"
                >
                  {signal}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="genial-surface rounded-[28px] p-4 shadow-2xl shadow-black/35">
              <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-[24px] border border-white/10 bg-black/[0.35] p-5">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Promessa de valor</div>
                  <div className="mt-3 text-3xl font-semibold text-pure-white">Mais conversão com menos ruído operacional.</div>
                  <p className="mt-3 text-sm leading-6 text-text-gray">
                    A plataforma elimina atrasos de resposta, organiza contexto de ponta a ponta e mantém o time focado no que gera receita.
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Painel em tempo real</div>
                      <div className="mt-2 text-xl font-semibold text-pure-white">Atendimento, CRM e agenda sincronizados</div>
                    </div>
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-500/[0.12] px-3 py-1 text-xs font-semibold text-accent-green">
                      Ativo
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {heroMetrics.map((metric, index) => (
                      <div
                        key={metric.label}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/[0.25] px-4 py-3 animate-fade-up"
                        style={{ animationDelay: `${index * 0.08}s` }}
                      >
                        <span className="text-sm text-text-gray">{metric.label}</span>
                        <span className={`text-sm font-semibold ${metric.tone}`}>{metric.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/[0.35] p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-text-gray">Prioridades da operação</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Fila comercial</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Leads por estágio</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Ações sensíveis</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Handoff e retomada</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Agenda</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Horários validados</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {outcomePillars.map((item, index) => (
            <article
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur animate-fade-up"
              style={{ animationDelay: `${0.14 + index * 0.08}s` }}
            >
              <div className="text-[11px] uppercase tracking-[0.24em] text-accent-green">Resultado</div>
              <h2 className="mt-3 text-xl font-semibold text-pure-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-text-gray">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/[0.30] p-8 backdrop-blur">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Por que escolher GerencIA</div>
              <h2 className="text-3xl font-semibold text-pure-white">Argumentos de negócio para quem precisa vender mais com consistência.</h2>
              <p className="max-w-3xl text-sm leading-6 text-text-gray">
                A plataforma não é só atendimento automatizado. Ela organiza execução comercial para acelerar resposta, elevar qualidade de lead e aumentar taxa de fechamento.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {strongArguments.map((item, index) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-fade-up"
                  style={{ animationDelay: `${0.18 + index * 0.06}s` }}
                >
                  <h3 className="text-lg font-semibold text-pure-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-text-gray">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/[0.30] p-8 backdrop-blur">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Recursos que sustentam crescimento</div>
              <h2 className="text-3xl font-semibold text-pure-white">Tecnologia aplicada para vender mais com consistência.</h2>
              <p className="max-w-3xl text-sm leading-6 text-text-gray">
                O sistema opera como uma camada comercial inteligente. Ele organiza contexto, acelera atendimento e mantém padrão de execução entre IA e equipe.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featureGrid.map((item, index) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-fade-up"
                  style={{ animationDelay: `${0.22 + index * 0.05}s` }}
                >
                  <h3 className="text-lg font-semibold text-pure-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-text-gray">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/[0.30] p-8 backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Como funciona</div>
              <h2 className="text-3xl font-semibold text-pure-white">Da entrada do lead ao agendamento, sem ruído operacional.</h2>
              <p className="max-w-xl text-sm leading-6 text-text-gray">
                O fluxo foi desenhado para aumentar conversão sem aumentar complexidade. Cada etapa prepara a próxima com contexto limpo e ação clara.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((step) => (
                <div key={step.step} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm font-semibold text-accent-green">{step.step}</div>
                  <div className="mt-4 text-lg font-semibold text-pure-white">{step.title}</div>
                  <p className="mt-3 text-sm leading-6 text-text-gray">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-r from-black via-black/80 to-black p-8 shadow-2xl shadow-black/30">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Comece agora</div>
              <h2 className="text-2xl font-semibold text-pure-white">Transforme atendimento em uma operação comercial de alta performance.</h2>
              <p className="max-w-2xl text-sm leading-6 text-text-gray">
                Acesse sua unidade e ative uma estrutura premium para qualificar, agendar e converter com mais segurança.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-full bg-gradient-to-r from-accent-green to-dark-green px-5 py-2.5 text-center text-sm font-semibold text-primary-black shadow-lg shadow-emerald-500/25"
              >
                Entrar no painel
              </Link>
              <Link
                href="/admin/login"
                className="rounded-full border border-white/15 px-5 py-2.5 text-center text-sm font-semibold text-pure-white transition hover:border-white/35"
              >
                Área administrativa
              </Link>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-18px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        @keyframes floatSlow {
          0% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(16px) translateX(12px);
          }
          100% {
            transform: translateY(0px) translateX(0px);
          }
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0px);
          }
        }
        .animate-fade-up {
          animation: fadeUp 0.7s ease both;
        }
        .animate-float {
          animation: float 9s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: floatSlow 12s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

"use client"

import Link from "next/link"

const heroMetrics = [
  { label: "Primeira resposta", value: "Até 2 min", tone: "text-cyan-300" },
  { label: "Atendimento contínuo", value: "24/7 com IA", tone: "text-emerald-300" },
  { label: "Canais conectados", value: "WhatsApp + Instagram", tone: "text-violet-300" },
]

const platformSignals = [
  {
    title: "Agentes autônomos com contexto real",
    description:
      "A IA entende histórico, estágio do lead e intenção de compra para responder com precisão, sem conversa genérica.",
  },
  {
    title: "Agendamento inteligente e sem conflito",
    description:
      "A agenda é consultada antes da oferta de horários. Menos retrabalho, menos erro e mais reuniões realmente confirmadas.",
  },
  {
    title: "Gestão por unidade com controle total",
    description:
      "Cada tenant opera com regras próprias, credenciais isoladas e visão clara de performance para escalar sem perder padrão.",
  },
]

const workflowSteps = [
  {
    step: "01",
    title: "Captura em todos os canais",
    description:
      "Leads entram por WhatsApp e Instagram com identificação automática de origem, contexto e prioridade de atendimento.",
  },
  {
    step: "02",
    title: "Qualificação e avanço de conversa",
    description:
      "A IA conduz a jornada, qualifica dor e perfil, quebra objeções e move o lead com consistência até o próximo passo.",
  },
  {
    step: "03",
    title: "Agendamento, follow-up e escala",
    description:
      "CRM, agenda, follow-up contextual e handoff humano trabalham juntos para transformar volume em resultado previsível.",
  },
]

const trustSignals = [
  "WhatsApp",
  "Instagram",
  "Direct",
  "Comentários",
  "CRM",
  "Agenda inteligente",
  "Follow-up contextual",
  "Operação multi-unidade",
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
              Plataforma de crescimento com IA
            </span>

            <div className="space-y-4">
              <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] text-pure-white md:text-5xl xl:text-6xl">
                Converta mais leads com agentes de IA autônomos no WhatsApp e Instagram.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text-gray md:text-lg">
                Centralize atendimento, CRM, agenda e automações em um único sistema. Sua operação responde rápido, qualifica melhor e agenda com mais precisão.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-white/20 transition hover:scale-[1.02]"
              >
                Entrar no painel
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
                  <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Promessa da plataforma</div>
                  <div className="mt-3 text-3xl font-semibold text-pure-white">Mais agendamentos, menos perda de lead</div>
                  <p className="mt-3 text-sm leading-6 text-text-gray">
                    Estrutura completa para vender com consistência: IA que conversa, qualifica, segue o fluxo e entrega contexto para o time fechar.
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Operação em tempo real</div>
                      <div className="mt-2 text-xl font-semibold text-pure-white">Atendimento, CRM e agenda sincronizados</div>
                    </div>
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-500/[0.12] px-3 py-1 text-xs font-semibold text-accent-green">
                      Online
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
                    <div className="text-xs uppercase tracking-[0.24em] text-text-gray">Visão da rotina</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Fila ativa</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Leads em qualificação</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Ações críticas</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Handoffs e reengajamentos</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Agenda</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Horários e confirmações</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Resposta 24/7", value: "Seu lead nunca fica sem retorno no momento mais quente da decisão." },
            { label: "Qualificação real", value: "A IA conduz descoberta de dor, perfil e intenção antes de avançar para proposta." },
            { label: "Conversão", value: "Agendamento com checagem de disponibilidade e fluxo contínuo até confirmação." },
            { label: "Escala com controle", value: "Operação multi-tenant com regras por unidade e governança central." },
          ].map((item, index) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur animate-fade-up"
              style={{ animationDelay: `${0.18 + index * 0.08}s` }}
            >
              <div className="text-[11px] uppercase tracking-[0.26em] text-text-gray">{item.label}</div>
              <p className="mt-3 text-sm leading-6 text-pure-white">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {platformSignals.map((item, index) => (
            <article
              key={item.title}
              className="genial-surface rounded-3xl p-6 animate-fade-up"
              style={{ animationDelay: `${0.24 + index * 0.08}s` }}
            >
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Funcionalidade-chave</div>
              <h2 className="mt-4 text-xl font-semibold text-pure-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-text-gray">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/[0.30] p-8 backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Como a operação flui</div>
              <h2 className="text-3xl font-semibold text-pure-white">Um sistema único para captar, qualificar, agendar e vender.</h2>
              <p className="max-w-xl text-sm leading-6 text-text-gray">
                Você substitui processos quebrados e respostas manuais por uma máquina comercial inteligente, com IA autônoma e time humano trabalhando no mesmo contexto.
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
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Pronto para escalar atendimento e vendas</div>
              <h2 className="text-2xl font-semibold text-pure-white">Ative seus agentes de IA e transforme conversas em receita previsível.</h2>
              <p className="max-w-2xl text-sm leading-6 text-text-gray">
                Entre agora e opere com uma base profissional para WhatsApp e Instagram, com automação, contexto e controle por unidade.
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

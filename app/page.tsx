"use client"

import Link from "next/link"

const heroMetrics = [
  { label: "Tempo médio de resposta", value: "Até 2 min", tone: "text-cyan-300" },
  { label: "Leads com contexto vivo", value: "100%", tone: "text-emerald-300" },
  { label: "Unidades centralizadas", value: "Multi-tenant", tone: "text-violet-300" },
]

const platformSignals = [
  { title: "Conversas em contexto", description: "Histórico limpo, leitura rápida do estágio do lead e operação contínua entre IA e humano." },
  { title: "Agenda e follow-up sob controle", description: "Acompanhamento da jornada sem perder o timing comercial e sem ruído operacional." },
  { title: "Gestão por unidade", description: "Cada operação mantém suas próprias regras, credenciais, fluxos e visão de desempenho." },
]

const workflowSteps = [
  {
    step: "01",
    title: "Captura e qualificação",
    description: "O sistema recebe o lead, organiza o contexto e sustenta uma triagem consistente desde a primeira mensagem.",
  },
  {
    step: "02",
    title: "Interação assistida",
    description: "IA e equipe compartilham contexto, preservam o histórico e mantêm a conversa produtiva sem rupturas.",
  },
  {
    step: "03",
    title: "Gestão e escala",
    description: "CRM, agenda, alertas e automações operam em conjunto para transformar volume em rotina previsível.",
  },
]

const trustSignals = ["WhatsApp", "Instagram", "CRM", "Agenda", "Follow-up", "Operação multi-unidade"]

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
              Gestão de atendimento com IA
            </span>

            <div className="space-y-4">
              <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] text-pure-white md:text-5xl xl:text-6xl">
                Operação comercial, atendimento e automação no mesmo painel.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text-gray md:text-lg">
                Centralize conversas, CRM, agenda e agentes de IA em uma estrutura única, com leitura clara do que está acontecendo e controle real por unidade.
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
                  <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Controle operacional</div>
                  <div className="mt-3 text-3xl font-semibold text-pure-white">Pulsos em tempo real</div>
                  <p className="mt-3 text-sm leading-6 text-text-gray">
                    Uma visão objetiva da operação para saber o que precisa de atenção, o que está fluindo e onde agir primeiro.
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.28em] text-text-gray">Painel vivo</div>
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
                        <div className="mt-2 text-lg font-semibold text-pure-white">Leads em andamento</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-gray">Ações críticas</div>
                        <div className="mt-2 text-lg font-semibold text-pure-white">Handoffs e retornos</div>
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
            { label: "Operação", value: "CRM, mensagens e agenda em um fluxo só." },
            { label: "Gestão", value: "Leitura rápida da unidade, sem depender de planilhas paralelas." },
            { label: "Escala", value: "Regras independentes por tenant, com base compartilhada de produto." },
            { label: "Execução", value: "IA e equipe trabalham com o mesmo contexto da conversa." },
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
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Capacidade</div>
              <h2 className="mt-4 text-xl font-semibold text-pure-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-text-gray">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/[0.30] p-8 backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Como a operação flui</div>
              <h2 className="text-3xl font-semibold text-pure-white">Uma base única para atender, acompanhar e crescer.</h2>
              <p className="max-w-xl text-sm leading-6 text-text-gray">
                A experiência de entrada precisa explicar rápido o valor do produto. Por isso a página inicial agora posiciona o sistema como plataforma operacional, não só como tela de login.
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
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent-green">Acesso imediato</div>
              <h2 className="text-2xl font-semibold text-pure-white">Entre com sua unidade e assuma a operação em poucos minutos.</h2>
              <p className="max-w-2xl text-sm leading-6 text-text-gray">
                Acesso do cliente e acesso administrativo seguem caminhos distintos, com uma apresentação mais clara desde a primeira tela.
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

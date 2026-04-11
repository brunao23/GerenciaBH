"use client"

export default function HomePage() {
  return (
    <div className="relative h-[100svh] min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#050505] text-pure-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.35),_transparent_70%)] blur-2xl animate-float-slow" />
        <div className="absolute bottom-[-30%] left-[-15%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.35),_transparent_70%)] blur-2xl animate-float" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_rgba(255,255,255,0.04)_1px,_transparent_1px),linear-gradient(to_right,_rgba(255,255,255,0.04)_1px,_transparent_1px)] bg-[size:80px_80px] opacity-30" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green to-dark-green text-primary-black font-bold">
            G
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">GerencIA</div>
            <div className="text-[11px] uppercase tracking-[0.35em] text-text-gray">
              Genial Labs AI
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-text-gray transition hover:border-white/30 hover:text-pure-white"
          >
            Entrar (Clientes)
          </a>
          <a
            href="/admin/login"
            className="rounded-full bg-gradient-to-r from-accent-green to-dark-green px-4 py-2 text-xs font-semibold text-primary-black shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02]"
          >
            Acesso administrativo
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-16 pt-6">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-accent-green">
              Plataforma colaborativa
            </span>
            <h1 className="font-display text-4xl font-semibold leading-tight text-pure-white md:text-5xl">
              GerencIA é a ferramenta que une o gerenciamento de agentes de IA autônomos com a interatividade e a ajuda do humano.
            </h1>
            <p className="text-base text-text-gray md:text-lg">
              Ferramenta colaborativa da Genial Labs AI com disparos em massa, chat em tempo real, CRM e automações
              para operações de alta performance.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/login"
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black shadow-lg shadow-white/20 transition hover:scale-[1.02]"
              >
                Entrar (Clientes)
              </a>
              <a
                href="/admin/login"
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-pure-white transition hover:border-white/40"
              >
                Acesso administrativo
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-text-gray">Insights</div>
                  <div className="mt-2 text-2xl font-semibold text-pure-white">Pulsos em tempo real</div>
                </div>
                <div className="rounded-full bg-accent-green/20 px-3 py-1 text-xs text-accent-green">
                  Live
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                {[
                  { label: "Mensagens entregues", value: "98,6%", color: "text-emerald-300" },
                  { label: "Leads qualificados", value: "+42%", color: "text-accent-green" },
                  { label: "Tempo de resposta", value: "<= 2 min", color: "text-cyan-300" },
                ].map((item, idx) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm animate-fade-up"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                  >
                    <span className="text-text-gray">{item.label}</span>
                    <span className={`font-semibold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/50 p-4 text-xs text-text-gray">
                GerencIA combina AI + regras de negócio para manter cada disparo, conversa e
                follow-up no ritmo certo.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Disparos inteligentes",
              desc: "Templates oficiais da Meta, variáveis dinâmicas e filas com controle de risco.",
            },
            {
              title: "Conversas em contexto",
              desc: "Histórico vivo, leitura e ações rápidas com indicadores do que realmente acontece.",
            },
            {
              title: "Orquestração multi-unidade",
              desc: "Operações multi-tenant com governança, métricas e alertas de qualidade.",
            },
          ].map((item, idx) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur animate-fade-up"
              style={{ animationDelay: `${0.2 + idx * 0.1}s` }}
            >
              <h3 className="text-lg font-semibold text-pure-white">{item.title}</h3>
              <p className="mt-3 text-sm text-text-gray">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-black via-black/70 to-black p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-pure-white">Pronto para operar com colaboração humano + IA?</h2>
              <p className="text-sm text-text-gray">
                Entre com sua unidade, explore o painel e orquestre agentes autônomos com apoio humano em tempo real.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="/login"
                className="flex-1 rounded-full bg-gradient-to-r from-accent-green to-dark-green px-5 py-2 text-center text-sm font-semibold text-primary-black shadow-lg shadow-emerald-500/20"
              >
                Entrar (Clientes)
              </a>
              <a
                href="/admin/login"
                className="flex-1 rounded-full border border-white/15 px-5 py-2 text-center text-sm font-semibold text-pure-white"
              >
                Acesso administrativo
              </a>
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

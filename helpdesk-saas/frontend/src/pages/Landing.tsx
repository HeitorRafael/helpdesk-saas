import { Link } from 'react-router-dom';

interface PlanCard {
  name: string;
  planTier: 'STARTER' | 'PROFISSIONAL';
  price: string;
  per: string;
  description: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    name: 'Starter',
    planTier: 'STARTER',
    price: 'R$97',
    per: 'por agente/mês · mín. 2 agentes',
    description: 'Pra começar a atender pelo WhatsApp de forma organizada.',
    features: ['Conversas via WhatsApp', 'Chamados com histórico completo', 'Setores e filas de atendimento', 'Chat interno da equipe', 'Painel básico'],
  },
  {
    name: 'Profissional',
    planTier: 'PROFISSIONAL',
    price: 'R$179',
    per: 'por agente/mês',
    description: 'Pra quem quer que a IA ajude a organizar e resumir cada atendimento.',
    features: ['Tudo do Starter', 'Resumo e classificação automática por IA', 'Monitor de atendimentos em tempo real', 'Relatórios avançados'],
    highlight: true,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-semibold text-ink">Helpdesk Intelligence</span>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink-soft hover:text-ink">
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep"
            >
              Testar grátis
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-12 pt-16 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-mid">Atendimento + IA + WhatsApp</span>
        <h1 className="mt-4 text-balance font-display text-4xl font-semibold leading-tight text-ink">
          Todo atendimento organizado, num só lugar
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Conecte o WhatsApp da sua empresa, deixe a IA resumir e classificar cada chamado, e nunca mais perca o
          histórico de quem atendeu o quê.
        </p>
        <Link
          to="/cadastro"
          className="mt-8 inline-block rounded-md bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-blue-deep"
        >
          Testar grátis por 30 dias
        </Link>
        <p className="mt-2 font-mono text-[11px] text-ink-soft">Cartão necessário no cadastro · cancele quando quiser</p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`w-[85%] shrink-0 snap-center rounded-lg border p-6 md:w-auto ${
                plan.highlight ? 'border-blue-mid bg-surface shadow-lg' : 'border-border bg-surface'
              }`}
            >
              {plan.highlight && (
                <span className="rounded-full bg-blue-mid/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-blue-deep">
                  Mais escolhido
                </span>
              )}
              <h2 className="mt-3 font-display text-xl font-semibold text-ink">{plan.name}</h2>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold text-ink">{plan.price}</span>
              </p>
              <p className="font-mono text-[11px] text-ink-soft">{plan.per}</p>
              <p className="mt-3 text-sm text-ink-soft">{plan.description}</p>

              <ul className="mt-5 flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-mid" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={`/cadastro?plano=${plan.planTier}`}
                className={`mt-6 block rounded-md py-2.5 text-center text-sm font-medium ${
                  plan.highlight ? 'bg-brand text-white hover:bg-blue-deep' : 'border border-border text-ink hover:bg-surface-muted'
                }`}
              >
                Começar
              </Link>
            </div>
          ))}

          <div className="w-[85%] shrink-0 snap-center rounded-lg border border-dashed border-border bg-surface p-6 md:w-auto">
            <h2 className="font-display text-xl font-semibold text-ink">+ Ligação</h2>
            <p className="mt-3 font-display text-3xl font-semibold text-ink">+R$69</p>
            <p className="font-mono text-[11px] text-ink-soft">por agente/mês (add-on)</p>
            <p className="mt-3 text-sm text-ink-soft">Ligação telefônica de verdade, direto no navegador — em breve.</p>
            <ul className="mt-5 flex flex-col gap-2">
              {['Softphone integrado', 'Distribuição automática de chamada', 'Reserve seu lugar desde já'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-mid" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/cadastro?plano=PROFISSIONAL&addon=voz"
              className="mt-6 block rounded-md border border-border py-2.5 text-center text-sm font-medium text-ink hover:bg-surface-muted"
            >
              Adicionar ao plano
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

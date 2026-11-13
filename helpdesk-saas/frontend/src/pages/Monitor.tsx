import { useEffect, useMemo, useState } from 'react';
import { getMonitorLive, MonitorLive } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { AGENT_STATUS_DOT_CLASS, AGENT_STATUS_LABELS, initials } from '../lib/labels';

const ITEMS_PER_PAGE = 4;
const ROTATE_INTERVAL_MS = 4000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type Attendance = {
  id: string;
  kind: 'call' | 'chat';
  clientName: string;
  agentName: string;
  startedAt: string;
};

export default function Monitor() {
  const { accessToken } = useAuth();
  const [live, setLive] = useState<MonitorLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [carouselPage, setCarouselPage] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    function refresh() {
      getMonitorLive(accessToken!)
        .then(setLive)
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o monitor.'));
    }

    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const attendances: Attendance[] = useMemo(() => {
    if (!live) return [];
    const calls: Attendance[] = live.activeCalls.map((call) => ({
      id: `call-${call.id}`,
      kind: 'call',
      clientName: call.contactName,
      agentName: call.userName,
      startedAt: call.startedAt,
    }));
    const chats: Attendance[] = live.activeChats.map((chat) => ({
      id: `chat-${chat.id}`,
      kind: 'chat',
      clientName: chat.contactName,
      agentName: chat.userName,
      startedAt: chat.startedAt,
    }));
    return [...calls, ...chats].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }, [live]);

  const totalPages = Math.max(1, Math.ceil(attendances.length / ITEMS_PER_PAGE));

  // Avança sozinho quando há mais atendimentos do que cabe numa página —
  // pensado pra ficar aberto num telão sem ninguém precisar clicar em nada.
  useEffect(() => {
    if (totalPages <= 1) {
      setCarouselPage(0);
      return;
    }
    const timer = setInterval(() => setCarouselPage((p) => (p + 1) % totalPages), ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [totalPages]);

  useEffect(() => {
    if (carouselPage >= totalPages) setCarouselPage(0);
  }, [carouselPage, totalPages]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!live) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  const pageItems = attendances.slice(carouselPage * ITEMS_PER_PAGE, carouselPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Monitor</h1>
          <p className="mt-1 text-sm text-ink-soft">Atendimento em tempo real do setor.</p>
        </div>
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-green-mid">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-mid" />
          Ao vivo
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <BigStat label="Chamadas hoje" value={live.counters.calls.today} />
        <BigStat label="Chamadas na semana" value={live.counters.calls.week} />
        <BigStat label="Chamadas no mês" value={live.counters.calls.month} />
        <BigStat label="Atendimentos hoje" value={live.counters.tickets.today} accent="blue" />
        <BigStat label="Atendimentos na semana" value={live.counters.tickets.week} accent="blue" />
        <BigStat label="Atendimentos no mês" value={live.counters.tickets.month} accent="blue" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Atendimentos em andamento</h2>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      i === carouselPage ? 'bg-blue-mid' : 'bg-ink-soft/20'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pageItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                    {initials(item.clientName)}
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-surface text-ink">
                      {item.kind === 'call' ? <PhoneIcon className="h-3 w-3" /> : <ChatBubbleIcon className="h-3 w-3" />}
                    </span>
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{item.clientName}</p>
                    <p className="text-xs text-ink-soft">
                      com {item.agentName} · {item.kind === 'call' ? 'telefone' : 'chat'}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm text-green-mid">
                  {formatDuration(now - new Date(item.startedAt).getTime())}
                </span>
              </div>
            ))}

            {attendances.length === 0 && (
              <p className="col-span-full rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-ink-soft">
                Nenhum atendimento em andamento agora.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Equipe agora</h2>

          <div className="mt-4 flex flex-col gap-2.5">
            {live.agentStatus.map((agent) => (
              <div key={agent.userId} className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENT_STATUS_DOT_CLASS[agent.status]}`} />
                <span className="flex-1 text-sm text-ink">{agent.userName}</span>
                <span className="font-mono text-[10px] uppercase text-ink-soft">{AGENT_STATUS_LABELS[agent.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value, accent }: { label: string; value: number; accent?: 'blue' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-5 text-center">
      <p className={`font-display text-4xl font-semibold ${accent === 'blue' ? 'text-blue-mid' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1v3.6c0 .6-.4 1-1 1C9.8 21 3 14.2 3 5.9c0-.6.4-1 1-1h3.6c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.2 1l-2.1 2.1z" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 4.5h16a1 1 0 011 1V15a1 1 0 01-1 1H9l-4 3.5V16H4a1 1 0 01-1-1V5.5a1 1 0 011-1z" />
    </svg>
  );
}

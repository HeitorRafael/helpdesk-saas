import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClientListItem,
  DashboardReports,
  DashboardSummary,
  getClients,
  getDashboardReports,
  getDashboardSummary,
  getUsers,
  TeamMember,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import Bar from '../components/Bar';

type DashboardView = 'overview' | 'reports';

export default function Dashboard() {
  const { accessToken } = useAuth();
  const [view, setView] = useState<DashboardView>('overview');

  if (!accessToken) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {view === 'overview' ? 'Visão geral dos chamados dos últimos 60 dias.' : 'Relatório detalhado com filtro de período, atendente e cliente.'}
          </p>
        </div>

        <div className="flex shrink-0 gap-1 rounded-md border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setView('overview')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'overview' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Visão geral
          </button>
          <button
            type="button"
            onClick={() => setView('reports')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'reports' ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Relatórios
          </button>
        </div>
      </div>

      <div className="mt-6">
        {view === 'overview' ? <OverviewView accessToken={accessToken} /> : <ReportsView accessToken={accessToken} />}
      </div>
    </div>
  );
}

function OverviewView({ accessToken }: { accessToken: string }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary(accessToken)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o dashboard.'));
  }, [accessToken]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!summary) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  const maxClientCount = Math.max(...summary.topClients.map((c) => c.count), 1);
  const maxTypeCount = Math.max(...summary.byTicketType.map((c) => c.count), 1);
  const maxWeekdayCount = Math.max(...summary.byWeekday.map((w) => w.count), 1);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total de chamados" value={summary.totalTickets} />
        <StatCard label="Em aberto" value={summary.openTickets} accent="blue" />
        <StatCard label="Fechados" value={summary.closedTickets} accent="green" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Clientes com mais chamados">
          <div className="flex flex-col gap-4">
            {summary.topClients.map((client) => (
              <Bar
                key={client.clientId}
                label={client.name}
                value={client.count}
                maxValue={maxClientCount}
                onClick={() => navigate(`/clientes/${client.clientId}`)}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Tipos de chamado mais frequentes">
          <div className="flex flex-col gap-4">
            {summary.byTicketType.map((t) => (
              <Bar key={t.ticketTypeId ?? 'sem-tipo'} label={t.name} value={t.count} maxValue={maxTypeCount} />
            ))}
          </div>
        </Panel>

        <Panel title="Picos por dia da semana" className="lg:col-span-2">
          <div className="flex flex-col gap-4">
            {summary.byWeekday.map((day) => (
              <Bar key={day.weekday} label={day.weekday} value={day.count} maxValue={maxWeekdayCount} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

type Preset = 'today' | 'month' | 'year' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hoje',
  month: 'Este mês',
  year: 'Este ano',
  custom: 'Personalizado',
};

function getPresetRange(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return {};
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function ReportsView({ accessToken }: { accessToken: string }) {
  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [userId, setUserId] = useState('');
  const [clientId, setClientId] = useState('');
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [reports, setReports] = useState<DashboardReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsers(accessToken).then(setUsers).catch(() => undefined);
    getClients(accessToken, { status: 'ALL' }).then(setClients).catch(() => undefined);
  }, [accessToken]);

  // Congelado no momento em que o filtro muda — se recalculasse "agora" a
  // cada render, o "to" andaria pra frente e disparava o fetch em loop.
  const range = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59`).toISOString() : undefined,
      };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    getDashboardReports(accessToken, { from: range.from, to: range.to, userId: userId || undefined, clientId: clientId || undefined })
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar relatório.'));
  }, [accessToken, range.from, range.to, userId, clientId]);

  const maxCallMinutes = reports ? Math.max(...reports.calls.byUser.map((u) => u.minutes), 1) : 1;
  const maxTicketCount = reports ? Math.max(...reports.tickets.byUser.map((u) => u.count), 1) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
            <span className="text-sm text-ink-soft">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>
        )}

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          <option value="">Todos os atendentes</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!reports && !error && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>
      )}

      {reports && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Atendimentos" value={reports.tickets.total} />
            <StatCard label="Chamadas" value={reports.calls.total} accent="blue" />
            <StatCard label="Minutos em chamada" value={reports.calls.totalMinutes} accent="green" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Minutos em chamada por atendente">
              <div className="flex flex-col gap-4">
                {reports.calls.byUser.map((u) => (
                  <Bar key={u.userId} label={u.userName} value={u.minutes} maxValue={maxCallMinutes} />
                ))}
                {reports.calls.byUser.length === 0 && <p className="text-sm text-ink-soft">Sem chamadas no período.</p>}
              </div>
            </Panel>

            <Panel title="Atendimentos por atendente">
              <div className="flex flex-col gap-4">
                {reports.tickets.byUser.map((u) => (
                  <Bar key={u.userId ?? 'sem-atendente'} label={u.userName} value={u.count} maxValue={maxTicketCount} />
                ))}
                {reports.tickets.byUser.length === 0 && (
                  <p className="text-sm text-ink-soft">Sem atendimentos no período.</p>
                )}
              </div>
            </Panel>

            <Panel title="Chamadas por cliente">
              <SimpleTable
                rows={reports.calls.byClient}
                columns={[
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'count', label: 'Chamadas' },
                  { key: 'minutes', label: 'Minutos' },
                ]}
              />
            </Panel>

            <Panel title="Atendimentos por cliente">
              <SimpleTable
                rows={reports.tickets.byClient}
                columns={[
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'count', label: 'Atendimentos' },
                ]}
              />
            </Panel>

            <Panel title="Tempo por status — disponível / pausado / offline" className="lg:col-span-2">
              <SimpleTable
                rows={reports.agentStatus.byUser.map((u) => ({
                  userName: u.userName,
                  available: formatMinutes(u.availableMinutes),
                  paused: formatMinutes(u.pausedMinutes),
                  offline: formatMinutes(u.offlineMinutes),
                }))}
                columns={[
                  { key: 'userName', label: 'Atendente' },
                  { key: 'available', label: 'Disponível' },
                  { key: 'paused', label: 'Pausado' },
                  { key: 'offline', label: 'Offline' },
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function SimpleTable<T extends Record<string, unknown>>({
  rows,
  columns,
}: {
  rows: T[];
  columns: { key: keyof T; label: string }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-soft">Sem dados no período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-ink-soft">
            {columns.map((c) => (
              <th key={String(c.key)} className="px-2 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={String(c.key)} className="px-2 py-2 text-ink">
                  {String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'blue' | 'green' }) {
  const accentClass = accent === 'blue' ? 'text-blue-mid' : accent === 'green' ? 'text-green-mid' : 'text-ink';

  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 ${className}`}>
      <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

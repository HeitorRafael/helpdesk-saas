import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSectors,
  getTicketTypes,
  getTickets,
  getUsers,
  Sector,
  Ticket,
  TicketStatus,
  TicketType,
  TeamMember,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDate } from '../lib/labels';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: TicketStatus | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'OPEN', label: 'Aberto' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'CLOSED', label: 'Fechado' },
];

export default function Tickets() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [handledByUserId, setHandledByUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getTicketTypes(accessToken).then(setTicketTypes).catch(() => undefined);
    getSectors(accessToken).then(setSectors).catch(() => undefined);
    getUsers(accessToken).then(setUsers).catch(() => undefined);
  }, [accessToken]);

  // Qualquer mudança de filtro volta pra página 1 — senão fica fácil ficar
  // preso numa página vazia depois de filtrar.
  useEffect(() => {
    setPage(1);
  }, [status, ticketTypeId, sectorId, handledByUserId, from, to, search]);

  useEffect(() => {
    if (!accessToken) return;
    const timeout = setTimeout(() => {
      getTickets(accessToken, {
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        ticketTypeId: ticketTypeId || undefined,
        sectorId: sectorId || undefined,
        handledByUserId: handledByUserId || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        search: search || undefined,
      })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar chamados.'));
    }, 250);
    return () => clearTimeout(timeout);
  }, [accessToken, page, status, ticketTypeId, sectorId, handledByUserId, from, to, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Chamados</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Criados automaticamente ao finalizar uma ligação ou conversa — {total} no total.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por assunto…"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={ticketTypeId}
          onChange={(e) => setTicketTypeId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          <option value="">Todos os tipos</option>
          {ticketTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={sectorId}
          onChange={(e) => setSectorId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          <option value="">Todos os setores</option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={handledByUserId}
          onChange={(e) => setHandledByUserId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        >
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
        <span className="text-sm text-ink-soft">até</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Assunto</th>
              <th className="px-4 py-3 font-medium">Cliente / contato</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Setor</th>
              <th className="px-4 py-3 font-medium">Responsável</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => navigate(`/chamados/${ticket.id}`)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
              >
                <td className="px-4 py-3 font-medium text-ink">{ticket.subject}</td>
                <td className="px-4 py-3 text-ink-soft">{ticket.client?.name ?? ticket.contactName ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{ticket.ticketType?.name ?? 'Sem tipo'}</td>
                <td className="px-4 py-3 text-ink-soft">{ticket.sector?.name ?? 'Sem setor'}</td>
                <td className="px-4 py-3 text-ink-soft">{ticket.handledBy?.name ?? 'Não atribuído'}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">{formatDate(ticket.createdAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items?.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">Nenhum chamado encontrado com esses filtros.</p>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-border px-3 py-1.5 text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

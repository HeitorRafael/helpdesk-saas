import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  generateTicketInsight,
  getSectors,
  getTicket,
  getTicketEvents,
  getTicketTypes,
  getUsers,
  Sector,
  Ticket,
  TicketEvent,
  TicketStatus,
  TicketType,
  TeamMember,
  updateTicket,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDate } from '../lib/labels';
import StatusBadge from '../components/StatusBadge';

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'CLOSED', label: 'Fechado' },
];

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) return;
    setTicket(null);
    getTicket(accessToken, id)
      .then((t) => {
        setTicket(t);
        setNotesDraft(t.resolutionNotes ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o chamado.'));
    getTicketTypes(accessToken).then(setTicketTypes).catch(() => undefined);
    getSectors(accessToken).then(setSectors).catch(() => undefined);
    getUsers(accessToken).then(setUsers).catch(() => undefined);
    getTicketEvents(accessToken, id).then(setEvents).catch(() => undefined);
  }, [accessToken, id]);

  async function patchTicket(payload: Parameters<typeof updateTicket>[2]) {
    if (!accessToken || !ticket) return;
    const previous = ticket;
    try {
      const updated = await updateTicket(accessToken, ticket.id, payload);
      setTicket(updated);
      getTicketEvents(accessToken, ticket.id).then(setEvents).catch(() => undefined);
    } catch (err) {
      setTicket(previous);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar o chamado.');
    }
  }

  async function handleSaveNotes() {
    if (!accessToken || !ticket) return;
    setSavingNotes(true);
    setError(null);
    try {
      const updated = await updateTicket(accessToken, ticket.id, { resolutionNotes: notesDraft });
      setTicket(updated);
      getTicketEvents(accessToken, ticket.id).then(setEvents).catch(() => undefined);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a descrição.');
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleGenerateWithAi() {
    if (!accessToken || !ticket) return;
    setGenerating(true);
    setAiError(null);
    try {
      const updated = await generateTicketInsight(accessToken, ticket.id);
      setTicket(updated);
      setNotesDraft(updated.resolutionNotes ?? '');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao gerar resumo com IA.');
    } finally {
      setGenerating(false);
    }
  }

  if (error && !ticket) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!ticket) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  const notesDirty = notesDraft !== (ticket.resolutionNotes ?? '');

  return (
    <div>
      <Link to="/chamados" className="font-mono text-xs uppercase tracking-wide text-blue-mid hover:underline">
        ← Voltar para chamados
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {ticket.client ? (
              <Link to={`/clientes/${ticket.client.id}`} className="text-blue-mid hover:underline">
                {ticket.client.name}
              </Link>
            ) : (
              (ticket.contactName ?? 'Contato não identificado')
            )}
            {ticket.contactPhone && <span> · {ticket.contactPhone}</span>}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-soft">Criado em {formatDate(ticket.createdAt)}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {ticket.description && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Contexto do atendimento</h2>
          <p className="mt-1 text-sm text-ink-soft">{ticket.description}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Tipo de atendimento</label>
          <select
            value={ticket.ticketTypeId ?? ''}
            onChange={(e) => patchTicket({ ticketTypeId: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          >
            <option value="">Sem tipo</option>
            {ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Setor responsável</label>
          <select
            value={ticket.sectorId ?? ''}
            onChange={(e) => patchTicket({ sectorId: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          >
            <option value="">Sem setor</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Status</label>
          <select
            value={ticket.status}
            onChange={(e) => patchTicket({ status: e.target.value as TicketStatus })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Responsável</label>
          <select
            value={ticket.handledByUserId ?? ''}
            onChange={(e) => patchTicket({ handledByUserId: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          >
            <option value="">Não atribuído</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-ink">O que foi feito</h2>
          <button
            type="button"
            onClick={handleGenerateWithAi}
            disabled={generating}
            className="rounded-md border border-blue-mid/30 bg-blue-mid/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-blue-mid hover:bg-blue-mid/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? 'Gerando…' : 'Gerar com IA'}
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          Gerado por IA quando configurada (Admin → Integração IA) — sempre editável antes ou depois de salvar.
        </p>

        {aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}

        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={5}
          placeholder="Descreva o que foi feito para resolver este chamado…"
          className="mt-3 w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={savingNotes || !notesDirty}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingNotes ? 'Salvando…' : 'Salvar'}
          </button>
          {savedFlash && <span className="text-xs text-green-mid">Salvo.</span>}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Histórico</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Registro de tudo que mudou neste chamado — pra validar depois quem fez o quê e quando.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {events.map((event) => (
            <div key={event.id} className="border-l-2 border-border pl-3">
              <p className="text-sm text-ink">{describeEvent(event, { sectors, ticketTypes, users })}</p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-soft">
                {event.user?.name ?? 'Sistema'} · {formatDate(event.createdAt)}
              </p>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-ink-soft">Nenhuma alteração registrada ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function describeEvent(
  event: TicketEvent,
  lookup: { sectors: Sector[]; ticketTypes: TicketType[]; users: TeamMember[] },
): string {
  const sectorName = (id: string | null) => (id ? lookup.sectors.find((s) => s.id === id)?.name ?? 'setor removido' : 'sem setor');
  const typeName = (id: string | null) => (id ? lookup.ticketTypes.find((t) => t.id === id)?.name ?? 'tipo removido' : 'sem tipo');
  const userName = (id: string | null) => (id ? lookup.users.find((u) => u.id === id)?.name ?? 'usuário removido' : 'ninguém');
  const statusLabel = (s: string | null) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s ?? '—';

  switch (event.type) {
    case 'STATUS_CHANGED':
      return `Mudou o status de "${statusLabel(event.oldValue)}" para "${statusLabel(event.newValue)}"`;
    case 'SECTOR_CHANGED':
      return `Encaminhou de "${sectorName(event.oldValue)}" para "${sectorName(event.newValue)}"`;
    case 'ASSIGNEE_CHANGED':
      return `Reatribuiu de ${userName(event.oldValue)} para ${userName(event.newValue)}`;
    case 'TYPE_CHANGED':
      return `Mudou o tipo de "${typeName(event.oldValue)}" para "${typeName(event.newValue)}"`;
    case 'NOTES_EDITED':
      return 'Editou "o que foi feito"';
    default:
      return 'Alteração registrada';
  }
}

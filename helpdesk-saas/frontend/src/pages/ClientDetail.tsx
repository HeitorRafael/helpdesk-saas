import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addClientAttribute, ClientWithTickets, getClient, removeClientAttribute } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDate } from '../lib/labels';
import StatusBadge from '../components/StatusBadge';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [client, setClient] = useState<ClientWithTickets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attrName, setAttrName] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [attrError, setAttrError] = useState<string | null>(null);
  const [savingAttr, setSavingAttr] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) return;
    setClient(null);
    getClient(accessToken, id)
      .then(setClient)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o cliente.'));
  }, [accessToken, id]);

  async function handleAddAttribute(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !client || !attrName.trim()) return;
    setAttrError(null);
    setSavingAttr(true);
    try {
      const attribute = await addClientAttribute(accessToken, client.id, {
        name: attrName.trim(),
        value: attrValue.trim(),
      });
      setClient((prev) => (prev ? { ...prev, attributes: [...prev.attributes, attribute] } : prev));
      setAttrName('');
      setAttrValue('');
    } catch (err) {
      setAttrError(err instanceof Error ? err.message : 'Erro ao adicionar característica.');
    } finally {
      setSavingAttr(false);
    }
  }

  async function handleRemoveAttribute(attributeId: string) {
    if (!accessToken || !client) return;
    const previous = client.attributes;
    setClient((prev) => (prev ? { ...prev, attributes: prev.attributes.filter((a) => a.id !== attributeId) } : prev));
    try {
      await removeClientAttribute(accessToken, client.id, attributeId);
    } catch (err) {
      setClient((prev) => (prev ? { ...prev, attributes: previous } : prev));
      setAttrError(err instanceof Error ? err.message : 'Erro ao remover característica.');
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!client) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <div>
      <Link to="/clientes" className="font-mono text-xs uppercase tracking-wide text-blue-mid hover:underline">
        ← Voltar para clientes
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{client.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{client.email}</p>
          {client.cnpj && <p className="mt-0.5 font-mono text-[11px] text-ink-soft">CNPJ: {client.cnpj}</p>}
        </div>
        <StatusBadge status={client.status} />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Características</h2>
        <p className="mt-1 text-xs text-ink-soft">O que esse cliente usa/tem — livre, sem catálogo fixo.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {client.attributes.map((attr) => (
            <span
              key={attr.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-ink"
            >
              <span className="font-medium">{attr.name}</span>
              {attr.value && <span className="text-ink-soft">· {attr.value}</span>}
              <button
                type="button"
                onClick={() => handleRemoveAttribute(attr.id)}
                title="Remover"
                className="ml-1 text-ink-soft hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}

          {client.attributes.length === 0 && <p className="text-xs text-ink-soft">Nenhuma característica ainda.</p>}
        </div>

        <form onSubmit={handleAddAttribute} className="mt-3 flex items-center gap-2">
          <input
            value={attrName}
            onChange={(e) => setAttrName(e.target.value)}
            placeholder="Nome (ex: PDV)"
            className="w-40 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          />
          <input
            value={attrValue}
            onChange={(e) => setAttrValue(e.target.value)}
            placeholder="Valor (ex: 8)"
            className="w-40 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          />
          <button
            type="submit"
            disabled={savingAttr || !attrName.trim()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar
          </button>
        </form>
        {attrError && <p className="mt-2 text-xs text-red-600">{attrError}</p>}
      </div>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {client.tickets.length} chamado{client.tickets.length === 1 ? '' : 's'} no histórico
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {client.tickets.map((ticket) => (
          <Link
            key={ticket.id}
            to={`/chamados/${ticket.id}`}
            className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{ticket.subject}</p>
                {ticket.description && <p className="mt-1 text-sm text-ink-soft">{ticket.description}</p>}
              </div>
              <StatusBadge status={ticket.status} />
            </div>
            <div className="mt-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <span>{ticket.ticketType?.name ?? 'Sem tipo'}</span>
              <span>·</span>
              <span>{formatDate(ticket.createdAt)}</span>
            </div>
          </Link>
        ))}

        {client.tickets.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-soft">
            Nenhum chamado registrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}

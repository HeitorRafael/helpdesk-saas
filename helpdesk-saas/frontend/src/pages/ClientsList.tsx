import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientListItem, ClientStatus, getClients } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import StatusBadge from '../components/StatusBadge';

type StatusFilter = ClientStatus | 'ALL';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'INACTIVE', label: 'Inativos' },
  { value: 'ALL', label: 'Todos' },
];

export default function ClientsList() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Ativos como padrão — resolve a dor real de clientes antigos/inativos
  // poluindo a busca no sistema atual da empresa.
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');

  useEffect(() => {
    if (!accessToken) return;
    const timeout = setTimeout(() => {
      getClients(accessToken, { search, status })
        .then(setClients)
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.'));
    }, 250);
    return () => clearTimeout(timeout);
  }, [accessToken, search, status]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Clientes</h1>
          <p className="mt-1 text-sm text-ink-soft">Ranqueados por volume de chamados.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/clientes/novo')}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep"
        >
          Novo cliente
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                status === tab.value ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Chamados</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients?.map((client) => (
              <tr
                key={client.id}
                onClick={() => navigate(`/clientes/${client.id}`)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
              >
                <td className="px-4 py-3 font-medium text-ink">{client.name}</td>
                <td className="px-4 py-3 text-ink-soft">{client.email}</td>
                <td className="px-4 py-3 font-mono text-ink-soft">{client.ticketCount}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={client.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {clients?.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">Nenhum cliente encontrado.</p>
        )}
      </div>
    </div>
  );
}

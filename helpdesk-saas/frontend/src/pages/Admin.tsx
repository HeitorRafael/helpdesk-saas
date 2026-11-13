import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AiProvider,
  AiSettings,
  connectWhatsApp,
  createQueue,
  createSector,
  createTicketType,
  createUser,
  deleteQueue,
  deleteSector,
  deleteTicketType,
  disconnectWhatsApp,
  getAiSettings,
  getAllUsers,
  getQueues,
  getSectors,
  getSubscription,
  getTicketTypes,
  getUsers,
  getWhatsAppStatus,
  Queue,
  Sector,
  Subscription,
  TeamMember,
  TicketType,
  UserAccount,
  updateAiSettings,
  updateQueue,
  updateUserRole,
  WhatsAppConnectionStatus,
  WhatsAppStatus,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDate, SECTOR_LABELS } from '../lib/labels';
import StatusBadge from '../components/StatusBadge';

type Tab = 'ia' | 'whatsapp' | 'assinatura' | 'filas' | 'tipos' | 'setores' | 'usuarios';

const TABS: { value: Tab; label: string }[] = [
  { value: 'ia', label: 'Integração IA' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'filas', label: 'Filas' },
  { value: 'tipos', label: 'Tipos de atendimento' },
  { value: 'setores', label: 'Setores de chamado' },
  { value: 'usuarios', label: 'Usuários' },
];

export default function Admin() {
  const { user, accessToken } = useAuth();
  const [tab, setTab] = useState<Tab>('ia');

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  if (!accessToken) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Admin</h1>
      <p className="mt-1 text-sm text-ink-soft">Configurações visíveis só para administradores da conta.</p>

      <div className="mt-6 flex gap-1 rounded-md border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.value ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'ia' && <AiSettingsPanel accessToken={accessToken} />}
        {tab === 'whatsapp' && <WhatsAppPanel accessToken={accessToken} />}
        {tab === 'assinatura' && <SubscriptionPanel accessToken={accessToken} />}
        {tab === 'filas' && <QueuesPanel accessToken={accessToken} />}
        {tab === 'tipos' && <TicketTypesPanel accessToken={accessToken} />}
        {tab === 'setores' && <SectorsPanel accessToken={accessToken} />}
        {tab === 'usuarios' && <UsersPanel accessToken={accessToken} />}
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<AiProvider, string> = {
  CLAUDE: 'Claude (Anthropic)',
  GEMINI: 'Gemini (Google)',
  GPT: 'GPT (OpenAI)',
};

function AiSettingsPanel({ accessToken }: { accessToken: string }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [provider, setProvider] = useState<AiProvider>('CLAUDE');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    getAiSettings(accessToken)
      .then((s) => {
        setSettings(s);
        if (s.provider) setProvider(s.provider);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar configuração de IA.'));
  }, [accessToken]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAiSettings(accessToken, provider, apiKey.trim());
      setSettings(updated);
      setApiKey('');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a chave de API.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-sm font-semibold text-ink">Chave de API de IA</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Usada para gerar automaticamente o resumo ("o que foi feito") e o tipo de cada chamado ao finalizar uma
        ligação ou conversa. Sem chave configurada, o chamado é criado normalmente, só sem esse preenchimento
        automático.
      </p>

      {settings?.hasApiKey && (
        <p className="mt-3 rounded-md bg-surface-muted px-3 py-2 font-mono text-[11px] text-ink-soft">
          Configurado: {settings.provider ? PROVIDER_LABELS[settings.provider] : ''} · chave {settings.maskedKey}
        </p>
      )}

      <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Provedor</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          >
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Chave de API</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole a chave aqui"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Salvando…' : 'Salvar e ativar'}
          </button>
          {savedFlash && <span className="text-xs text-green-mid">Chave salva — a IA já está ativa.</span>}
        </div>
      </form>
    </div>
  );
}

const WHATSAPP_STATUS_LABELS: Record<WhatsAppConnectionStatus, string> = {
  DISCONNECTED: 'Desconectado',
  CONNECTING: 'Conectando…',
  QR_PENDING: 'Aguardando leitura do QR code',
  CONNECTED: 'Conectado',
};

const WHATSAPP_STATUS_DOT: Record<WhatsAppConnectionStatus, string> = {
  DISCONNECTED: 'bg-ink-soft/40',
  CONNECTING: 'bg-chrome-2',
  QR_PENDING: 'bg-chrome-2',
  CONNECTED: 'bg-green-mid',
};

function WhatsAppPanel({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Só alarma quando a conexão CAI depois de ter funcionado — no primeiro
  // acesso (nunca conectado ainda), "Desconectado" é só o estado normal.
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      getWhatsAppStatus(accessToken)
        .then((s) => {
          if (cancelled) return;
          if (s.status === 'CONNECTED') wasConnectedRef.current = true;
          setStatus(s);
        })
        .catch(() => undefined);
    }
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken]);

  const droppedUnexpectedly = status?.status === 'DISCONNECTED' && wasConnectedRef.current;

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      await connectWhatsApp(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar a conexão.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await disconnectWhatsApp(accessToken);
      wasConnectedRef.current = false; // foi o próprio usuário que desconectou — não é queda
      setStatus({ status: 'DISCONNECTED', phoneNumber: null, qrDataUrl: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar.');
    } finally {
      setBusy(false);
    }
  }

  const isBusyConnecting = status?.status === 'CONNECTING' || status?.status === 'QR_PENDING';

  return (
    <div className="max-w-lg rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-sm font-semibold text-ink">Conexão com WhatsApp</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Conecta um número real de WhatsApp pra receber e responder mensagens em Conversas — funciona como o
        WhatsApp Web: no celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho, e escaneie o QR
        code abaixo. Use um número secundário, não o principal do dia a dia — essa conexão não é oficial/aprovada
        pela Meta, então há um risco real (baixo, mas existente) de bloqueio do número.
      </p>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {droppedUnexpectedly && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          A conexão caiu inesperadamente — os clientes não estão recebendo resposta agora. Clique em "Conectar" e
          escaneie o QR de novo pra religar.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${status ? WHATSAPP_STATUS_DOT[status.status] : 'bg-ink-soft/40'}`} />
        <span className="text-sm text-ink">{status ? WHATSAPP_STATUS_LABELS[status.status] : 'Carregando…'}</span>
        {status?.status === 'CONNECTED' && status.phoneNumber && (
          <span className="font-mono text-xs text-ink-soft">· +{status.phoneNumber}</span>
        )}
      </div>

      {status?.status === 'QR_PENDING' && status.qrDataUrl && (
        <img
          src={status.qrDataUrl}
          alt="QR code de conexão do WhatsApp"
          className="mt-4 h-56 w-56 rounded-md border border-border"
        />
      )}

      <div className="mt-4">
        {status?.status === 'CONNECTED' ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Desconectando…' : 'Desconectar'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || isBusyConnecting}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBusyConnecting ? 'Aguardando conexão…' : busy ? 'Iniciando…' : 'Conectar'}
          </button>
        )}
      </div>
    </div>
  );
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Em teste grátis',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
};

const PLAN_TIER_LABELS: Record<string, string> = { STARTER: 'Starter', PROFISSIONAL: 'Profissional' };

function SubscriptionPanel({ accessToken }: { accessToken: string }) {
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubscription(accessToken)
      .then(setSubscription)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar a assinatura.'));
  }, [accessToken]);

  if (subscription === undefined) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <div className="max-w-lg rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-sm font-semibold text-ink">Assinatura</h2>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {!subscription ? (
        <p className="mt-3 text-sm text-ink-soft">
          Esta conta ainda não tem uma assinatura registrada (conta anterior à cobrança, ou criada manualmente).
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm text-ink">
          <p>
            Plano: <strong>{PLAN_TIER_LABELS[subscription.planTier]}</strong> ·{' '}
            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </p>
          {subscription.status === 'TRIALING' && (
            <p className="text-ink-soft">Teste grátis até {formatDate(subscription.trialEndsAt)}.</p>
          )}
          {subscription.status === 'PAST_DUE' && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              Pagamento pendente — regularize pra evitar interrupção do acesso.
            </p>
          )}
          {subscription.currentPeriodEnd && (
            <p className="text-ink-soft">Próxima cobrança em {formatDate(subscription.currentPeriodEnd)}.</p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2.5">
        <div>
          <p className="text-sm text-ink">Ligação (add-on)</p>
          <p className="font-mono text-[10px] text-ink-soft">+R$69/agente/mês — em breve</p>
        </div>
        <label className="inline-flex cursor-not-allowed items-center opacity-50">
          <input type="checkbox" checked={subscription?.voiceAddonEnabled ?? false} disabled className="h-4 w-4 rounded border-border" />
        </label>
      </div>
    </div>
  );
}

function QueuesPanel({ accessToken }: { accessToken: string }) {
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    getQueues(accessToken)
      .then(setQueues)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar filas.'));
  }

  useEffect(() => {
    reload();
    getUsers(accessToken).then(setUsers).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createQueue(accessToken, { name: newName.trim() });
      setNewName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar fila.');
    }
  }

  async function toggleMember(queue: Queue, userId: string) {
    const memberUserIds = queue.memberUserIds.includes(userId)
      ? queue.memberUserIds.filter((id) => id !== userId)
      : [...queue.memberUserIds, userId];
    try {
      const updated = await updateQueue(accessToken, queue.id, { memberUserIds });
      setQueues((prev) => prev?.map((q) => (q.id === queue.id ? updated : q)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar membros da fila.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteQueue(accessToken, id);
      setQueues((prev) => prev?.filter((q) => q.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar fila.');
    }
  }

  return (
    <div className="max-w-2xl">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome da nova fila"
          className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Criar fila
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {queues?.map((queue) => (
          <div key={queue.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase ${queue.colorClassName ?? ''}`}>
                {queue.name}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(queue.id)}
                className="font-mono text-[10px] uppercase text-ink-soft hover:text-red-600"
              >
                Apagar
              </button>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-soft">Quem vê essa fila</p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={queue.memberUserIds.includes(u.id)}
                    onChange={() => toggleMember(queue, u.id)}
                    className="h-3.5 w-3.5 rounded border-border text-blue-mid focus:ring-blue-mid"
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        ))}

        {queues?.length === 0 && <p className="text-sm text-ink-soft">Nenhuma fila cadastrada ainda.</p>}
      </div>
    </div>
  );
}

function TicketTypesPanel({ accessToken }: { accessToken: string }) {
  const [ticketTypes, setTicketTypes] = useState<TicketType[] | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    getTicketTypes(accessToken)
      .then(setTicketTypes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar tipos de atendimento.'));
  }

  useEffect(reload, [accessToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createTicketType(accessToken, newName.trim());
      setNewName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tipo de atendimento.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTicketType(accessToken, id);
      setTicketTypes((prev) => prev?.filter((t) => t.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar tipo de atendimento.');
    }
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs text-ink-soft">
        A IA classifica automaticamente cada chamado em um desses tipos ao gerar o resumo — ex: "Impressora",
        "Dúvidas".
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleCreate} className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do novo tipo (ex: Impressora)"
          className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {ticketTypes?.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-ink"
          >
            {t.name}
            <button type="button" onClick={() => handleDelete(t.id)} className="text-ink-soft hover:text-red-600">
              ×
            </button>
          </span>
        ))}
        {ticketTypes?.length === 0 && <p className="text-sm text-ink-soft">Nenhum tipo cadastrado ainda.</p>}
      </div>
    </div>
  );
}

function SectorsPanel({ accessToken }: { accessToken: string }) {
  const [sectors, setSectors] = useState<Sector[] | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    getSectors(accessToken)
      .then(setSectors)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar setores.'));
  }

  useEffect(reload, [accessToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createSector(accessToken, newName.trim());
      setNewName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar setor.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSector(accessToken, id);
      setSectors((prev) => prev?.filter((s) => s.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar setor.');
    }
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs text-ink-soft">
        Pra onde um chamado pode ser encaminhado (ex: "Desenvolvimento") — separado de quem está atribuído
        individualmente, ajuda a saber com qual setor cobrar um chamado parado.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleCreate} className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do novo setor (ex: Desenvolvimento)"
          className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {sectors?.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-ink"
          >
            {s.name}
            <button type="button" onClick={() => handleDelete(s.id)} className="text-ink-soft hover:text-red-600">
              ×
            </button>
          </span>
        ))}
        {sectors?.length === 0 && <p className="text-sm text-ink-soft">Nenhum setor cadastrado ainda.</p>}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = Object.keys(SECTOR_LABELS) as (keyof typeof SECTOR_LABELS)[];

function UsersPanel({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('SUPORTE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  function reload() {
    getAllUsers(accessToken)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar usuários.'));
  }

  // É aqui que o admin dá (ou tira) poderes de admin de outra pessoa.
  async function handleRoleChange(user: UserAccount, newRole: string) {
    const previous = user.role;
    setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)) ?? prev);
    try {
      await updateUserRole(accessToken, user.id, newRole);
    } catch (err) {
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role: previous } : u)) ?? prev);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar o papel do usuário.');
    }
  }

  useEffect(reload, [accessToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    setSaving(true);
    setError(null);
    try {
      await createUser(accessToken, { name: name.trim(), email: email.trim(), password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('SUPORTE');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-sm font-semibold text-ink">Novo usuário</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Cria o login pra alguém da equipe entrar no sistema — defina a senha inicial aqui, a pessoa pode trocar
          depois.
        </p>

        <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Senha inicial</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 10 caracteres, com letra e número"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Papel</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {SECTOR_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !name.trim() || !email.trim() || !password}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Criando…' : 'Criar usuário'}
            </button>
            {savedFlash && <span className="text-xs text-green-mid">Usuário criado — já pode fazer login.</span>}
          </div>
        </form>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {SECTOR_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {users?.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-soft">Nenhum usuário ainda.</p>}
      </div>
    </div>
  );
}

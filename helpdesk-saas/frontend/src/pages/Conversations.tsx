import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  claimWhatsAppConversation,
  finishWhatsAppConversation,
  getQueues,
  getUsers,
  getWhatsAppAttachmentUrl,
  getWhatsAppConversations,
  getWhatsAppMessages,
  Queue,
  sendWhatsAppAttachment,
  sendWhatsAppMessage,
  TeamMember,
  Ticket,
  transferWhatsAppConversation,
  WhatsAppConversation,
  WhatsAppMessage,
} from '../lib/api';
import { initials } from '../lib/labels';
import { useAuth } from '../lib/auth-context';
import { useSound } from '../lib/sound-context';
import StatusBadge from '../components/StatusBadge';

const QUEUE_VISIBILITY_KEY = 'helpdesk-visible-queues';
const POLL_CONVERSATIONS_MS = 5000;
const POLL_MESSAGES_MS = 4000;

type Tab = 'mine' | 'queue' | 'all';

const TABS: { value: Tab; label: string }[] = [
  { value: 'mine', label: 'Meus atendimentos' },
  { value: 'queue', label: 'Fila' },
  { value: 'all', label: 'Todos' },
];

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Sem fila atribuída (queueId null) sempre aparece, independente do filtro
// de visibilidade — uma mensagem nova nunca pode ficar invisível só por
// ainda não ter sido encaminhada pra uma fila.
function isQueueVisible(queueId: string | null, visibleQueueIds: Set<string>): boolean {
  return queueId === null || visibleQueueIds.has(queueId);
}

export default function Conversations() {
  const { user, accessToken } = useAuth();
  const me = useMemo(() => ({ id: user!.id, name: user!.name }), [user]);
  const { queueVolume, messageVolume, setQueueVolume, setMessageVolume, playQueue, playMessage } = useSound();

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [tab, setTab] = useState<Tab>('mine');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleQueueIds, setVisibleQueueIds] = useState<Set<string>>(new Set());

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferQueueId, setTransferQueueId] = useState<string | null>(null);

  const [queues, setQueues] = useState<Queue[]>([]);
  const [colleagues, setColleagues] = useState<TeamMember[]>([]);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [ticketByConversationId, setTicketByConversationId] = useState<Record<string, Ticket>>({});

  const activeIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const lastMessageAtRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const myQueues = useMemo(() => queues.filter((q) => q.memberUserIds.includes(me.id)), [queues, me.id]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!accessToken) return;
    getQueues(accessToken).then(setQueues).catch(() => undefined);
    getUsers(accessToken).then((users) => setColleagues(users.filter((u) => u.id !== me.id))).catch(() => undefined);
  }, [accessToken, me.id]);

  useEffect(() => {
    if (myQueues.length === 0) return;
    const raw = localStorage.getItem(QUEUE_VISIBILITY_KEY);
    if (raw) {
      try {
        const stored = new Set(JSON.parse(raw) as string[]);
        setVisibleQueueIds(new Set(myQueues.filter((q) => stored.has(q.id)).map((q) => q.id)));
        return;
      } catch {
        // cai pro padrão abaixo
      }
    }
    setVisibleQueueIds(new Set(myQueues.map((q) => q.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myQueues.length]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (visibleQueueIds.size > 0 || myQueues.length === 0) {
      localStorage.setItem(QUEUE_VISIBILITY_KEY, JSON.stringify(Array.from(visibleQueueIds)));
    }
  }, [visibleQueueIds, myQueues.length]);

  // Poll da lista de conversas — pega novas mensagens/atendimentos que
  // chegaram, sem depender de qual conversa está aberta no momento.
  useEffect(() => {
    if (!accessToken) return;

    function refresh() {
      getWhatsAppConversations(accessToken!)
        .then((fresh) => {
          if (knownIdsRef.current) {
            const newlyOpen = fresh.filter(
              (c) => c.status === 'OPEN' && !knownIdsRef.current!.has(c.id) && isQueueVisible(c.queueId, visibleQueueIds),
            );
            if (newlyOpen.length > 0) playQueue();
          }
          knownIdsRef.current = new Set(fresh.map((c) => c.id));
          setConversations(fresh.map((c) => (c.id === activeIdRef.current ? { ...c, unreadCount: 0 } : c)));
        })
        .catch(() => undefined);
    }

    refresh();
    const interval = setInterval(refresh, POLL_CONVERSATIONS_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, visibleQueueIds]);

  function appendMessage(message: WhatsAppMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    lastMessageAtRef.current = message.createdAt;
    if (message.direction === 'IN') playMessage();
  }

  // Poll das mensagens da conversa aberta — reinicia sempre que troca de
  // conversa ativa.
  useEffect(() => {
    setMessages([]);
    lastMessageAtRef.current = null;
    if (!accessToken || !activeId) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    getWhatsAppMessages(accessToken, activeId)
      .then((initial) => {
        if (cancelled) return;
        setMessages(initial);
        lastMessageAtRef.current = initial.length > 0 ? initial[initial.length - 1].createdAt : null;

        interval = setInterval(() => {
          getWhatsAppMessages(accessToken, activeId, lastMessageAtRef.current ?? undefined)
            .then((fresh) => fresh.forEach(appendMessage))
            .catch(() => undefined);
        }, POLL_MESSAGES_MS);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeId]);

  function getQueueDisplay(queueId: string | null): Queue | undefined {
    return queueId ? queues.find((q) => q.id === queueId) : undefined;
  }

  const tabFiltered = useMemo(() => {
    return conversations.filter((c) => {
      if (tab === 'mine') return c.claimedByUserId === me.id && c.status === 'IN_PROGRESS';
      if (tab === 'queue') return c.status === 'OPEN' && isQueueVisible(c.queueId, visibleQueueIds);
      return isQueueVisible(c.queueId, visibleQueueIds) || c.claimedByUserId === me.id;
    });
  }, [conversations, tab, visibleQueueIds, me.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((c) => (c.contactName ?? '').toLowerCase().includes(q) || c.contactPhone?.includes(q));
  }, [tabFiltered, search]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const isMine = !!active && active.claimedByUserId === me.id && active.status === 'IN_PROGRESS';

  function selectConversation(id: string) {
    setActiveId(id);
    setTransferOpen(false);
    setFinishError(null);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }

  async function claim(id: string) {
    if (!accessToken) return;
    setError(null);
    try {
      const updated = await claimWhatsAppConversation(accessToken, id);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setActiveId(id);
      setTab('mine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Essa conversa já foi pega por outra pessoa.');
    }
  }

  function openTransfer() {
    if (!active) return;
    setTransferQueueId(active.queueId);
    setTransferOpen(true);
  }

  async function transferTo(colleague: TeamMember) {
    if (!accessToken || !active) return;
    try {
      const updated = await transferWhatsAppConversation(accessToken, active.id, {
        queueId: transferQueueId,
        claimedByUserId: colleague.id,
      });
      setConversations((prev) => prev.map((c) => (c.id === active.id ? updated : c)));
      setTransferOpen(false);
      setTab('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir o atendimento.');
    }
  }

  async function finish(id: string) {
    if (!accessToken) return;
    setFinishingId(id);
    setFinishError(null);
    try {
      const { ticket } = await finishWhatsAppConversation(accessToken, id);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'CLOSED' } : c)));
      setTicketByConversationId((prev) => ({ ...prev, [id]: ticket }));
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Erro ao finalizar o atendimento.');
    } finally {
      setFinishingId(null);
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active || !isMine || !accessToken) return;
    setSending(true);
    try {
      const message = await sendWhatsAppMessage(accessToken, active.id, text);
      appendMessage(message);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(blob: Blob, filename: string) {
    if (!accessToken || !active || !isMine) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendWhatsAppAttachment(accessToken, active.id, blob, filename);
      appendMessage(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) sendAttachment(file, file.name);
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        sendAttachment(blob, `audio-${Date.now()}.webm`);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('Não foi possível acessar o microfone — verifique a permissão do navegador.');
    }
  }

  function toggleQueueVisible(queueId: string) {
    setVisibleQueueIds((prev) => {
      const next = new Set(prev);
      if (next.has(queueId)) next.delete(queueId);
      else next.add(queueId);
      return next;
    });
  }

  const activeTicket = active ? ticketByConversationId[active.id] : undefined;

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Conversas</h1>
        <p className="mt-1 text-sm text-ink-soft">Atendimento em tempo real com os clientes pelo WhatsApp.</p>
      </div>

      <div className="mt-4 flex min-h-[420px]" style={{ height: 'calc(100vh - 10.5rem)' }}>
        <div className="flex w-80 shrink-0 flex-col border-r border-border pr-4">
          <div className="flex items-center justify-between gap-1 border-b border-border p-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.value ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              title="Configurações de filas"
              className="shrink-0 rounded p-1.5 text-ink-soft hover:bg-surface-muted hover:text-ink"
            >
              <GearIcon className="h-4 w-4" />
            </button>
          </div>

          {settingsOpen && (
            <div className="border-b border-border bg-surface-muted p-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Filas que eu vejo</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {myQueues.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={visibleQueueIds.has(q.id)}
                      onChange={() => toggleQueueVisible(q.id)}
                      className="h-3.5 w-3.5 rounded border-border text-blue-mid focus:ring-blue-mid"
                    />
                    {q.name}
                  </label>
                ))}
                {myQueues.length === 0 && (
                  <p className="text-xs text-ink-soft">
                    Nenhuma fila atribuída a você ainda — peça a um admin em Admin → Filas.
                  </p>
                )}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Volume</p>

                <div className="mt-2 flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-ink">Fila</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={queueVolume}
                    onChange={(e) => setQueueVolume(Number(e.target.value))}
                    className="h-1.5 flex-1 accent-blue-mid"
                  />
                  <button
                    type="button"
                    onClick={playQueue}
                    title="Testar som de fila"
                    className="shrink-0 font-mono text-[10px] uppercase text-blue-mid hover:underline"
                  >
                    Testar
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-ink">Mensagem</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={messageVolume}
                    onChange={(e) => setMessageVolume(Number(e.target.value))}
                    className="h-1.5 flex-1 accent-blue-mid"
                  />
                  <button
                    type="button"
                    onClick={playMessage}
                    title="Testar som de mensagem"
                    className="shrink-0 font-mono text-[10px] uppercase text-blue-mid hover:underline"
                  >
                    Testar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-b border-border p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por contato ou telefone…"
              className="w-full rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.map((c) => {
              const queue = getQueueDisplay(c.queueId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors ${
                    c.id === activeId ? 'bg-surface-muted' : 'hover:bg-surface-muted/60'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-medium text-white">
                    {initials(c.contactName ?? c.contactPhone ?? '?')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{c.contactName ?? c.contactPhone}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-soft">{formatTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-soft">{c.contactPhone}</span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {queue && (
                          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase ${queue.colorClassName ?? ''}`}>
                            {queue.name}
                          </span>
                        )}
                        <span className="truncate text-xs text-ink-soft">{c.lastMessagePreview}</span>
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-blue-mid px-1 text-[10px] font-medium text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">Nenhuma conversa encontrada.</p>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col pl-4">
          {active ? (
            <>
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink">{active.contactName ?? active.contactPhone}</p>
                      {(() => {
                        const queue = getQueueDisplay(active.queueId);
                        return queue ? (
                          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${queue.colorClassName ?? ''}`}>
                            {queue.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="font-mono text-[11px] text-ink-soft">{active.contactPhone}</p>
                  </div>
                  <StatusBadge status={active.status} />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono text-[11px] text-ink-soft">
                    {active.status === 'OPEN' && <span>Aguardando atendimento</span>}
                    {active.status === 'IN_PROGRESS' && active.claimedAt && (
                      <span>
                        ⏱ {formatDuration(now - new Date(active.claimedAt).getTime())} em atendimento
                        {!isMine && active.claimedBy && <span> · atribuído a {active.claimedBy.name}</span>}
                      </span>
                    )}
                    {active.status === 'CLOSED' && <span>Atendimento finalizado</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    {active.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => claim(active.id)}
                        className="rounded-md bg-green-mid px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        Pegar atendimento
                      </button>
                    )}
                    {isMine && (
                      <>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={openTransfer}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
                          >
                            Transferir
                          </button>

                          {transferOpen && (
                            <div className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-border bg-surface p-3 shadow-lg">
                              <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Fila de destino</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {queues.map((q) => (
                                  <button
                                    key={q.id}
                                    type="button"
                                    onClick={() => setTransferQueueId(q.id)}
                                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                                      transferQueueId === q.id ? 'ring-1 ring-blue-mid' : ''
                                    } ${q.colorClassName ?? ''}`}
                                  >
                                    {q.name}
                                  </button>
                                ))}
                              </div>

                              <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                                Transferir para
                              </p>
                              <div className="mt-1.5 flex flex-col gap-1">
                                {colleagues.map((colleague) => (
                                  <button
                                    key={colleague.id}
                                    type="button"
                                    onClick={() => transferTo(colleague)}
                                    className="rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted"
                                  >
                                    {colleague.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => finish(active.id)}
                          disabled={finishingId === active.id}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {finishingId === active.id ? 'Finalizando…' : 'Finalizar atendimento'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {active.status === 'CLOSED' && (
                  <div className="mt-2">
                    {finishError && <p className="font-mono text-[10px] text-red-600">{finishError}</p>}

                    {activeTicket ? (
                      <div className="mt-2 rounded-md border border-blue-mid/20 bg-blue-mid/5 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-wide text-blue-mid">
                          Chamado criado automaticamente
                        </p>
                        <Link to={`/chamados/${activeTicket.id}`} className="mt-1 block text-xs text-blue-mid hover:underline">
                          {activeTicket.subject} — ver chamado
                        </Link>
                        {activeTicket.resolutionNotes ? (
                          <p className="mt-1 text-xs text-ink-soft">{activeTicket.resolutionNotes}</p>
                        ) : (
                          <p className="mt-1 text-xs text-ink-soft">
                            Sem resumo automático — configure a chave de IA em Admin → Integração IA, ou preencha
                            manualmente no chamado.
                          </p>
                        )}
                      </div>
                    ) : (
                      !finishError && <p className="font-mono text-[10px] text-ink-soft">Atendimento finalizado.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-surface-muted/40 px-4 py-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'OUT' ? 'bg-blue-mid text-white' : 'border border-border bg-surface text-ink'
                      }`}
                    >
                      {m.mediaMimeType ? (
                        <div>
                          <AttachmentContent messageId={m.id} mimeType={m.mediaMimeType} />
                          {m.text && <p className="mt-1.5">{m.text}</p>}
                        </div>
                      ) : (
                        <p>{m.text}</p>
                      )}
                      <p className={`mt-1 text-right font-mono text-[10px] ${m.direction === 'OUT' ? 'text-white/70' : 'text-ink-soft'}`}>
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}

                {messages.length === 0 && (
                  <p className="py-12 text-center text-sm text-ink-soft">Nenhuma mensagem ainda.</p>
                )}
              </div>

              {error && <p className="border-t border-border px-4 py-2 text-xs text-red-600">{error}</p>}

              <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border p-3">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={photoInputRef}
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <input type="file" accept="video/*" ref={videoInputRef} onChange={handleFileSelected} className="hidden" />

                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={!isMine || sending}
                  title="Enviar foto"
                  className="shrink-0 rounded-md border border-border p-2 text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PhotoIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={!isMine || sending}
                  title="Enviar vídeo"
                  className="shrink-0 rounded-md border border-border p-2 text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <VideoIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={!isMine || sending}
                  title={recording ? 'Parar gravação' : 'Gravar áudio'}
                  className={`shrink-0 rounded-md border p-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                    recording ? 'animate-pulse border-red-600 text-red-600' : 'border-border text-ink-soft hover:text-ink'
                  }`}
                >
                  <MicIcon className="h-4 w-4" />
                </button>

                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!isMine}
                  placeholder={isMine ? 'Digite uma mensagem…' : 'Pegue o atendimento pra poder responder'}
                  className="flex-1 rounded-md border border-border px-3 py-2 text-sm placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!isMine || !draft.trim() || sending}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Enviar
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-ink-soft">Selecione uma conversa</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentContent({ messageId, mimeType }: { messageId: string; mimeType: string }) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    getWhatsAppAttachmentUrl(accessToken, messageId)
      .then((resolved) => {
        if (cancelled) {
          URL.revokeObjectURL(resolved);
          return;
        }
        objectUrl = resolved;
        setUrl(resolved);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, messageId]);

  if (!url) {
    return <p className="text-xs text-ink-soft">Carregando anexo…</p>;
  }
  if (mimeType.startsWith('image/')) {
    return <img src={url} alt="imagem" className="max-h-64 max-w-full rounded-md" />;
  }
  if (mimeType.startsWith('audio/')) {
    return <audio controls src={url} className="max-w-full" />;
  }
  return <video controls src={url} className="max-h-64 max-w-full rounded-md" />;
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7L6.3 6.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M8 5.5l1.2-2h5.6l1.2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3" y="6" width="13" height="12" rx="1.5" />
      <path d="M16 10l5-2.5v9L16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11v.5a6 6 0 0012 0V11M12 17.5v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

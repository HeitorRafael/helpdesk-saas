import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import {
  getInternalAttachmentUrl,
  getInternalMessages,
  getTeamStatus,
  InternalMessage,
  InternalMessageType,
  sendInternalAttachment,
  sendInternalTextMessage,
  TeamStatusEntry,
} from '../lib/api';
import { AGENT_STATUS_DOT_CLASS } from '../lib/labels';

const POLL_MESSAGES_MS = 4000;
const POLL_STATUS_MS = 5000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function InternalChat() {
  const { accessToken, user } = useAuth();
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [teamStatus, setTeamStatus] = useState<TeamStatusEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMessageAtRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const statusByUserId = useMemo(() => new Map(teamStatus.map((t) => [t.userId, t.status])), [teamStatus]);

  function appendMessage(message: InternalMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    lastMessageAtRef.current = message.createdAt;
  }

  // Carrega as últimas mensagens uma vez, depois faz poll só do que é novo
  // (usando ?since=) — evita reprocessar tudo a cada 4s.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    getInternalMessages(accessToken)
      .then((initial) => {
        if (cancelled) return;
        setMessages(initial);
        lastMessageAtRef.current = initial.length > 0 ? initial[initial.length - 1].createdAt : null;

        interval = setInterval(() => {
          getInternalMessages(accessToken, lastMessageAtRef.current ?? undefined)
            .then((fresh) => {
              fresh.forEach(appendMessage);
            })
            .catch(() => undefined);
        }, POLL_MESSAGES_MS);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar o chat.'));

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    function refresh() {
      getTeamStatus(accessToken!).then(setTeamStatus).catch(() => undefined);
    }
    refresh();
    const interval = setInterval(refresh, POLL_STATUS_MS);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSendText(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendInternalTextMessage(accessToken, draft.trim());
      appendMessage(message);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function handleSendAttachment(blob: Blob, filename: string) {
    if (!accessToken) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendInternalAttachment(accessToken, blob, filename);
      appendMessage(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (file) handleSendAttachment(file, file.name);
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
        handleSendAttachment(blob, `audio-${Date.now()}.webm`);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('Não foi possível acessar o microfone — verifique a permissão do navegador.');
    }
  }

  if (!user) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>;
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Chat interno</h1>
        <p className="mt-1 text-sm text-ink-soft">Canal único da equipe — texto, foto, áudio e vídeo.</p>
      </div>

      <div
        className="mt-6 flex overflow-hidden rounded-lg border border-border bg-surface"
        style={{ height: 'calc(100vh - 13rem)' }}
      >
        <div className="flex w-64 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">Participantes</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {teamStatus.map((member) => (
              <div key={member.userId} className="flex items-center gap-2.5 rounded-md px-2 py-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENT_STATUS_DOT_CLASS[member.status]}`} />
                <span className="truncate text-sm text-ink">{member.name}</span>
                {member.userId === user.id && <span className="shrink-0 text-xs text-ink-soft">(você)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface-muted/40 px-4 py-4">
            {messages.map((m) => {
              const isMine = m.user.id === user.id;
              const status = statusByUserId.get(m.user.id);
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                      isMine ? 'bg-blue-mid text-white' : 'border border-border bg-surface text-ink'
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                        <span
                          className={`h-2 w-2 rounded-full ${status ? AGENT_STATUS_DOT_CLASS[status] : 'bg-ink-soft/30'}`}
                        />
                        {m.user.name}
                      </p>
                    )}

                    {m.type === 'TEXT' ? (
                      <p>{m.text}</p>
                    ) : (
                      <div>
                        <AttachmentContent messageId={m.id} type={m.type} fileName={m.attachmentFileName} />
                        {m.text && <p className="mt-1.5">{m.text}</p>}
                      </div>
                    )}

                    <p className={`mt-1 text-right font-mono text-[10px] ${isMine ? 'text-white/70' : 'text-ink-soft'}`}>
                      {formatTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}

            {messages.length === 0 && (
              <p className="py-12 text-center text-sm text-ink-soft">Nenhuma mensagem ainda — comece a conversa.</p>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="border-t border-border px-4 py-2 text-xs text-red-600">{error}</p>}

          <form onSubmit={handleSendText} className="flex items-center gap-2 border-t border-border p-3">
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
              disabled={sending}
              title="Enviar foto"
              className="shrink-0 rounded-md border border-border p-2 text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PhotoIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={sending}
              title="Enviar vídeo"
              className="shrink-0 rounded-md border border-border p-2 text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <VideoIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={sending}
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
              placeholder="Digite uma mensagem…"
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm placeholder:text-ink-soft/50 focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AttachmentContent({
  messageId,
  type,
  fileName,
}: {
  messageId: string;
  type: InternalMessageType;
  fileName: string | null;
}) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    getInternalAttachmentUrl(accessToken, messageId)
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

  if (type === 'IMAGE') {
    return <img src={url} alt={fileName ?? 'imagem'} className="max-h-64 max-w-full rounded-md" />;
  }
  if (type === 'AUDIO') {
    return <audio controls src={url} className="max-w-full" />;
  }
  return <video controls src={url} className="max-h-64 max-w-full rounded-md" />;
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

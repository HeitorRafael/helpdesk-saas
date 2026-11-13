import { useEffect, useRef, useState } from 'react';
import { AGENT_STATUS_DOT_CLASS, AGENT_STATUS_LABELS, initials } from '../lib/labels';
import { useAuth } from '../lib/auth-context';
import {
  AgentStatusValue,
  Call,
  endCall,
  getMyAgentStatus,
  getUsers,
  setAgentStatus,
  startCall,
  TeamMember,
  transferCall,
} from '../lib/api';

type CallState = 'idle' | 'ringing' | 'active';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Sem integração real ainda — a chamada "recebida" é simulada localmente pra
// dar pra testar o fluxo antes de plugar a API paralela do WhatsApp. A
// chamada em si (início/fim/transferência) já é gravada de verdade no back-end.
const MOCK_CALLER = { name: 'Clínica Vitalis', phone: '+55 11 91234-5678' };

const STATUS_VALUES: AgentStatusValue[] = ['AVAILABLE', 'PAUSED', 'OFFLINE'];

const TAB_COLOR_BY_STATUS: Record<AgentStatusValue, string> = {
  AVAILABLE: `${AGENT_STATUS_DOT_CLASS.AVAILABLE} hover:opacity-90`,
  PAUSED: `${AGENT_STATUS_DOT_CLASS.PAUSED} hover:opacity-90`,
  OFFLINE: `${AGENT_STATUS_DOT_CLASS.OFFLINE} hover:opacity-90`,
};

interface PhoneSchedule {
  autoAvailable: { enabled: boolean; time: string };
  autoPause: { enabled: boolean; from: string; to: string };
  autoOffline: { enabled: boolean; time: string };
}

const DEFAULT_SCHEDULE: PhoneSchedule = {
  autoAvailable: { enabled: false, time: '08:00' },
  autoPause: { enabled: false, from: '12:00', to: '13:00' },
  autoOffline: { enabled: false, time: '18:00' },
};

const SCHEDULE_KEY = 'helpdesk-phone-schedule';
const SCHEDULE_FIRED_KEY = 'helpdesk-phone-schedule-fired';

function loadSchedule(): PhoneSchedule {
  const raw = localStorage.getItem(SCHEDULE_KEY);
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

function loadFiredMap(): Record<string, string> {
  const raw = localStorage.getItem(SCHEDULE_FIRED_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function PhoneWidget() {
  const { accessToken, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [dialInput, setDialInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<AgentStatusValue>('OFFLINE');
  const [colleagues, setColleagues] = useState<TeamMember[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);

  const [schedule, setSchedule] = useState<PhoneSchedule>(loadSchedule);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    getMyAgentStatus(accessToken)
      .then((current) => {
        if (current) {
          setStatus(current.status);
        } else {
          // Primeira vez nesta sessão — começa disponível.
          setAgentStatus(accessToken, 'AVAILABLE')
            .then((created) => setStatus(created.status))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);

    getUsers(accessToken)
      .then((users) => setColleagues(users.filter((u) => u.id !== user?.id)))
      .catch(() => undefined);
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (callState === 'active') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  useEffect(() => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  }, [schedule]);

  async function handleSetStatus(next: AgentStatusValue) {
    if (!accessToken) return;
    setStatus(next); // otimista — a abinha já reage na hora
    try {
      await setAgentStatus(accessToken, next);
    } catch {
      // mantém o valor otimista; próxima ação corrige se ficou fora de sincronia
    }
  }

  // Cada horário agendado é um gatilho de disparo único por dia — no minuto
  // configurado, se ainda não disparou hoje, chama a MESMA função que o
  // clique manual chama. Depois disso ele não "força" nada: um clique manual
  // um segundo depois vale normalmente, nada reverte. Não é diferente de
  // alguém ter clicado o botão nesse minuto exato.
  useEffect(() => {
    function checkSchedule() {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayKey = now.toISOString().slice(0, 10);
      const fired = loadFiredMap();

      function markFired(triggerId: string) {
        const next = { ...loadFiredMap(), [triggerId]: todayKey };
        localStorage.setItem(SCHEDULE_FIRED_KEY, JSON.stringify(next));
      }

      if (schedule.autoAvailable.enabled && schedule.autoAvailable.time === hhmm && fired.autoAvailable !== todayKey) {
        markFired('autoAvailable');
        handleSetStatus('AVAILABLE');
      }
      if (schedule.autoPause.enabled && schedule.autoPause.from === hhmm && fired.autoPauseStart !== todayKey) {
        markFired('autoPauseStart');
        handleSetStatus('PAUSED');
      }
      if (schedule.autoPause.enabled && schedule.autoPause.to === hhmm && fired.autoPauseEnd !== todayKey) {
        markFired('autoPauseEnd');
        handleSetStatus('AVAILABLE');
      }
      if (schedule.autoOffline.enabled && schedule.autoOffline.time === hhmm && fired.autoOffline !== todayKey) {
        markFired('autoOffline');
        handleSetStatus('OFFLINE');
      }
    }

    const interval = setInterval(checkSchedule, 30_000);
    return () => clearInterval(interval);
  }, [schedule, accessToken]);

  function updateSchedule<K extends keyof PhoneSchedule>(key: K, patch: Partial<PhoneSchedule[K]>) {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function simulateIncomingCall() {
    setCallState('ringing');
  }

  async function answer() {
    setCallState('active');
    setExpanded(true);
    if (!accessToken) return;
    try {
      const call = await startCall(accessToken, {
        contactName: MOCK_CALLER.name,
        phone: MOCK_CALLER.phone,
        direction: 'INBOUND',
      });
      setActiveCall(call);
    } catch {
      // sem back-end disponível — mantém a chamada só localmente
    }
  }

  function decline() {
    setCallState('idle');
  }

  async function hangUp() {
    setCallState('idle');
    setDialInput('');
    setTransferOpen(false);
    if (accessToken && activeCall) {
      await endCall(accessToken, activeCall.id).catch(() => undefined);
    }
    setActiveCall(null);
  }

  async function dialOut() {
    if (!dialInput.trim()) return;
    setCallState('active');
    if (!accessToken) return;
    try {
      const call = await startCall(accessToken, {
        contactName: 'Discagem manual',
        phone: dialInput.trim(),
        direction: 'OUTBOUND',
      });
      setActiveCall(call);
    } catch {
      // idem — segue só localmente
    }
  }

  async function transferTo(colleague: TeamMember) {
    if (!accessToken || !activeCall) return;
    try {
      await transferCall(accessToken, activeCall.id, colleague.id);
    } catch {
      // se falhar, a chamada continua comigo — não derruba a UI
      return;
    }
    setTransferOpen(false);
    setCallState('idle');
    setActiveCall(null);
    setDialInput('');
  }

  const formattedElapsed = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const currentCaller = activeCall ? { name: activeCall.contactName, phone: activeCall.phone } : MOCK_CALLER;

  return (
    <div className="fixed right-0 top-1/2 z-40 -translate-y-1/2">
      <div className="flex items-center">
        {expanded && (
          <div className="w-72 rounded-l-lg border border-r-0 border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">Telefone</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                title="Recolher"
                className="text-ink-soft hover:text-ink"
              >
                <ChevronIcon direction="right" className="h-4 w-4" />
              </button>
            </div>

            {callState === 'idle' && (
              <div className="border-b border-border px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {STATUS_VALUES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSetStatus(value)}
                        title={AGENT_STATUS_LABELS[value]}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase transition-colors ${
                          status === value ? 'bg-surface-muted text-ink' : 'text-ink-soft hover:text-ink'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${AGENT_STATUS_DOT_CLASS[value]}`} />
                        {AGENT_STATUS_LABELS[value]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleOpen((o) => !o)}
                    title="Agendar horários"
                    className={`shrink-0 rounded p-1 ${scheduleOpen ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
                  >
                    <ClockIcon className="h-4 w-4" />
                  </button>
                </div>

                {scheduleOpen && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-border pt-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={schedule.autoAvailable.enabled}
                          onChange={(e) => updateSchedule('autoAvailable', { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border text-blue-mid focus:ring-blue-mid"
                        />
                        Ligar às
                      </label>
                      <input
                        type="time"
                        value={schedule.autoAvailable.time}
                        onChange={(e) => updateSchedule('autoAvailable', { time: e.target.value })}
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={schedule.autoPause.enabled}
                          onChange={(e) => updateSchedule('autoPause', { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border text-blue-mid focus:ring-blue-mid"
                        />
                        Pausar
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={schedule.autoPause.from}
                          onChange={(e) => updateSchedule('autoPause', { from: e.target.value })}
                          className="w-[4.5rem] rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                        />
                        <span className="text-[10px] text-ink-soft">às</span>
                        <input
                          type="time"
                          value={schedule.autoPause.to}
                          onChange={(e) => updateSchedule('autoPause', { to: e.target.value })}
                          className="w-[4.5rem] rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={schedule.autoOffline.enabled}
                          onChange={(e) => updateSchedule('autoOffline', { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border text-blue-mid focus:ring-blue-mid"
                        />
                        Desligar às
                      </label>
                      <input
                        type="time"
                        value={schedule.autoOffline.time}
                        onChange={(e) => updateSchedule('autoOffline', { time: e.target.value })}
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                      />
                    </div>

                    <p className="font-mono text-[9px] leading-relaxed text-ink-soft">
                      Só automatiza o clique — se você mudar manualmente, vale o que você clicou.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="p-4">
              {callState === 'idle' && (
                <>
                  <input
                    value={dialInput}
                    onChange={(e) => setDialInput(e.target.value)}
                    placeholder="Digite um número…"
                    className="w-full rounded-md border border-border px-3 py-2 text-center text-sm tracking-wide focus:border-blue-mid focus:outline-none focus:ring-1 focus:ring-blue-mid"
                  />

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {DIAL_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDialInput((v) => v + key)}
                        className="rounded-md border border-border py-2 text-sm font-medium text-ink hover:bg-surface-muted"
                      >
                        {key}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={dialOut}
                    disabled={!dialInput.trim()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-green-mid py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PhoneIcon className="h-4 w-4" />
                    Ligar
                  </button>

                  <button
                    type="button"
                    onClick={simulateIncomingCall}
                    disabled={status !== 'AVAILABLE'}
                    title={status !== 'AVAILABLE' ? 'Só toca quando você está disponível' : undefined}
                    className="mt-4 w-full text-center font-mono text-[11px] text-ink-soft underline-offset-2 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                  >
                    Simular chamada recebida
                  </button>
                </>
              )}

              {callState === 'ringing' && (
                <div className="flex flex-col items-center gap-1 py-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                    {initials(MOCK_CALLER.name)}
                  </span>
                  <p className="mt-2 text-sm font-medium text-ink">{MOCK_CALLER.name}</p>
                  <p className="font-mono text-[11px] text-ink-soft">{MOCK_CALLER.phone}</p>
                  <p className="mt-1 animate-pulse font-mono text-[11px] uppercase tracking-wide text-green-mid">
                    Chamada recebida…
                  </p>

                  <div className="mt-4 flex w-full gap-2">
                    <button
                      type="button"
                      onClick={decline}
                      className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      onClick={answer}
                      className="flex-1 rounded-md bg-green-mid py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      Atender
                    </button>
                  </div>
                </div>
              )}

              {callState === 'active' && (
                <div className="flex flex-col items-center gap-1 py-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                    {initials(currentCaller.name)}
                  </span>
                  <p className="mt-2 text-sm font-medium text-ink">{currentCaller.name}</p>
                  <p className="font-mono text-[11px] text-ink-soft">{currentCaller.phone}</p>
                  <p className="mt-1 font-mono text-xs text-green-mid">Em chamada · {formattedElapsed}</p>

                  <div className="relative mt-4 w-full">
                    <button
                      type="button"
                      onClick={() => setTransferOpen((o) => !o)}
                      disabled={!activeCall}
                      title={!activeCall ? 'Chamada não sincronizada com o servidor' : undefined}
                      className="w-full rounded-md border border-border py-2 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Transferir
                    </button>

                    {transferOpen && (
                      <div className="absolute bottom-full left-0 z-10 mb-2 w-full rounded-md border border-border bg-surface p-2 text-left shadow-lg">
                        {colleagues.length === 0 && (
                          <p className="px-2 py-1.5 text-center font-mono text-[10px] text-ink-soft">
                            Nenhum colega encontrado.
                          </p>
                        )}
                        {colleagues.map((colleague) => (
                          <button
                            key={colleague.id}
                            type="button"
                            onClick={() => transferTo(colleague)}
                            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted"
                          >
                            {colleague.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={hangUp}
                    className="mt-2 w-full rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Encerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => (callState === 'ringing' ? answer() : setExpanded((e) => !e))}
          title={callState === 'ringing' ? 'Atender chamada' : expanded ? 'Recolher telefone' : 'Abrir telefone'}
          className={`flex h-14 w-8 items-center justify-center rounded-l-lg border border-border text-white shadow-md transition-colors ${
            callState === 'ringing' ? 'animate-pulse bg-green-mid' : TAB_COLOR_BY_STATUS[status]
          }`}
        >
          <PhoneIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path
        d="M5 4.5h3l1.5 4-2 1.5a11 11 0 006.5 6.5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 013.5 6.1 1.5 1.5 0 015 4.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`${direction === 'right' ? 'rotate-180' : ''} ${className ?? ''}`}
    >
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

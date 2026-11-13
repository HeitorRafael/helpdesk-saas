const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
}

interface SessionResult {
  accessToken: string;
  user: AuthUser;
  tenant: AuthTenant;
}

interface LoginPayload {
  email: string;
  password: string;
}

async function postAuth(path: string, payload: unknown): Promise<SessionResult> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // necessário para o cookie httpOnly de refresh token
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? 'Não foi possível concluir.');
  }

  return data as SessionResult;
}

export function login(payload: LoginPayload): Promise<SessionResult> {
  return postAuth('/api/auth/login', payload);
}

export function registerCompany(payload: {
  companyName: string;
  name: string;
  email: string;
  password: string;
}): Promise<SessionResult> {
  return postAuth('/api/auth/register-company', payload);
}

export function completeOAuthSignup(payload: {
  pendingToken: string;
  companyName: string;
  password: string;
}): Promise<SessionResult> {
  return postAuth('/api/auth/oauth/complete-signup', payload);
}

// Navegação completa (não fetch) — o fluxo OAuth precisa de um redirect de
// página inteira pro provedor.
export const GOOGLE_SIGNUP_URL = `${API_BASE_URL}/api/auth/oauth/google/start`;
export const APPLE_SIGNUP_URL = `${API_BASE_URL}/api/auth/oauth/apple/start`;

// Restaura a sessão a partir do cookie httpOnly de refresh token — usado no
// carregamento inicial do app pra sobreviver a um F5 sem perder o login.
// Retorna null (silenciosamente) se não houver sessão válida.
export async function refreshSession(): Promise<SessionResult | null> {
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) return null;
  return (await res.json()) as SessionResult;
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Não foi possível concluir.');
  }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Não foi possível concluir.');
  }
}

export async function logoutSession(accessToken: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function authFetch<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Erro ao comunicar com o servidor.');
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface DashboardSummary {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  topClients: { clientId: string; name: string; count: number }[];
  byTicketType: { ticketTypeId: string | null; name: string; count: number }[];
  byWeekday: { weekday: string; count: number }[];
}

export function getDashboardSummary(accessToken: string): Promise<DashboardSummary> {
  return authFetch(accessToken, '/api/dashboard/summary');
}

export type ClientStatus = 'ACTIVE' | 'INACTIVE';

export interface ClientListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cnpj: string | null;
  status: ClientStatus;
  ticketCount: number;
  createdAt: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
export type TicketSource = 'CALL' | 'CHAT' | 'MANUAL';

export interface Ticket {
  id: string;
  clientId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  subject: string;
  description: string | null;
  resolutionNotes: string | null;
  ticketTypeId: string | null;
  sectorId: string | null;
  status: TicketStatus;
  source: TicketSource;
  createdAt: string;
  closedAt: string | null;
  handledByUserId: string | null;
  client?: { id: string; name: string; phone?: string | null } | null;
  ticketType?: { id: string; name: string } | null;
  sector?: { id: string; name: string } | null;
  handledBy?: { id: string; name: string } | null;
}

export interface ClientAttribute {
  id: string;
  name: string;
  value: string;
  createdAt: string;
}

export interface ClientWithTickets {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cnpj: string | null;
  status: ClientStatus;
  createdAt: string;
  tickets: Ticket[];
  attributes: ClientAttribute[];
}

export function getClients(
  accessToken: string,
  params: { search?: string; status?: ClientStatus | 'ALL' } = {},
): Promise<ClientListItem[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  const qs = query.toString();
  return authFetch(accessToken, `/api/clients${qs ? `?${qs}` : ''}`);
}

export function createClient(
  accessToken: string,
  payload: { name: string; email: string; phone?: string; cnpj?: string; attributes?: { name: string; value: string }[] },
): Promise<ClientWithTickets> {
  return authFetch(accessToken, '/api/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addClientAttribute(
  accessToken: string,
  clientId: string,
  payload: { name: string; value: string },
): Promise<ClientAttribute> {
  return authFetch(accessToken, `/api/clients/${clientId}/attributes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removeClientAttribute(accessToken: string, clientId: string, attributeId: string): Promise<void> {
  return authFetch(accessToken, `/api/clients/${clientId}/attributes/${attributeId}`, {
    method: 'DELETE',
  });
}

export function getClient(accessToken: string, id: string): Promise<ClientWithTickets> {
  return authFetch(accessToken, `/api/clients/${id}`);
}

// ---------- Chamados (Tickets) ----------

export interface TicketsPage {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export function getTickets(
  accessToken: string,
  params: {
    page?: number;
    pageSize?: number;
    status?: TicketStatus;
    ticketTypeId?: string;
    sectorId?: string;
    handledByUserId?: string;
    clientId?: string;
    from?: string;
    to?: string;
    search?: string;
  } = {},
): Promise<TicketsPage> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const qs = query.toString();
  return authFetch(accessToken, `/api/tickets${qs ? `?${qs}` : ''}`);
}

export function getTicket(accessToken: string, id: string): Promise<Ticket> {
  return authFetch(accessToken, `/api/tickets/${id}`);
}

export function updateTicket(
  accessToken: string,
  id: string,
  payload: Partial<{
    status: TicketStatus;
    handledByUserId: string | null;
    resolutionNotes: string;
    ticketTypeId: string | null;
    sectorId: string | null;
  }>,
): Promise<Ticket> {
  return authFetch(accessToken, `/api/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function generateTicketInsight(accessToken: string, id: string): Promise<Ticket> {
  return authFetch(accessToken, `/api/tickets/${id}/generate-insight`, { method: 'POST' });
}

export type TicketEventType = 'STATUS_CHANGED' | 'SECTOR_CHANGED' | 'ASSIGNEE_CHANGED' | 'NOTES_EDITED' | 'TYPE_CHANGED';

export interface TicketEvent {
  id: string;
  type: TicketEventType;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export function getTicketEvents(accessToken: string, id: string): Promise<TicketEvent[]> {
  return authFetch(accessToken, `/api/tickets/${id}/events`);
}

export function createTicketFromAttendance(
  accessToken: string,
  payload: {
    source: 'CALL' | 'CHAT';
    clientId?: string;
    contactName: string;
    contactPhone?: string;
    startedAt: string;
    endedAt: string;
    context?: string;
  },
): Promise<Ticket> {
  return authFetch(accessToken, '/api/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------- Tipos de atendimento ----------

export interface TicketType {
  id: string;
  name: string;
  createdAt: string;
}

export function getTicketTypes(accessToken: string): Promise<TicketType[]> {
  return authFetch(accessToken, '/api/ticket-types');
}

export function createTicketType(accessToken: string, name: string): Promise<TicketType> {
  return authFetch(accessToken, '/api/ticket-types', { method: 'POST', body: JSON.stringify({ name }) });
}

export function deleteTicketType(accessToken: string, id: string): Promise<void> {
  return authFetch(accessToken, `/api/ticket-types/${id}`, { method: 'DELETE' });
}

// ---------- Setores responsáveis ----------

export interface Sector {
  id: string;
  name: string;
  createdAt: string;
}

export function getSectors(accessToken: string): Promise<Sector[]> {
  return authFetch(accessToken, '/api/sectors');
}

export function createSector(accessToken: string, name: string): Promise<Sector> {
  return authFetch(accessToken, '/api/sectors', { method: 'POST', body: JSON.stringify({ name }) });
}

export function deleteSector(accessToken: string, id: string): Promise<void> {
  return authFetch(accessToken, `/api/sectors/${id}`, { method: 'DELETE' });
}

// ---------- Filas ----------

export interface Queue {
  id: string;
  name: string;
  colorClassName: string | null;
  memberUserIds: string[];
}

export function getQueues(accessToken: string): Promise<Queue[]> {
  return authFetch(accessToken, '/api/queues');
}

export function createQueue(
  accessToken: string,
  payload: { name: string; memberUserIds?: string[] },
): Promise<Queue> {
  return authFetch(accessToken, '/api/queues', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateQueue(
  accessToken: string,
  id: string,
  payload: Partial<{ name: string; memberUserIds: string[] }>,
): Promise<Queue> {
  return authFetch(accessToken, `/api/queues/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteQueue(accessToken: string, id: string): Promise<void> {
  return authFetch(accessToken, `/api/queues/${id}`, { method: 'DELETE' });
}

// ---------- Configuração de IA (admin) ----------

export type AiProvider = 'CLAUDE' | 'GEMINI' | 'GPT';

export interface AiSettings {
  provider: AiProvider | null;
  hasApiKey: boolean;
  maskedKey: string | null;
}

export function getAiSettings(accessToken: string): Promise<AiSettings> {
  return authFetch(accessToken, '/api/tenants/ai-settings');
}

export function updateAiSettings(accessToken: string, provider: AiProvider, apiKey: string): Promise<AiSettings> {
  return authFetch(accessToken, '/api/tenants/ai-settings', {
    method: 'PUT',
    body: JSON.stringify({ provider, apiKey }),
  });
}

// ---------- Sessões de chat (Conversas) ----------

export interface ChatSession {
  id: string;
  userId: string;
  clientId: string | null;
  contactName: string;
  companyName: string | null;
  startedAt: string;
  endedAt: string | null;
}

export function claimChatSession(
  accessToken: string,
  payload: { contactName: string; companyName?: string; clientId?: string },
): Promise<ChatSession> {
  return authFetch(accessToken, '/api/chat-sessions', { method: 'POST', body: JSON.stringify(payload) });
}

export function endChatSession(accessToken: string, id: string, context?: string): Promise<{ ticket: Ticket }> {
  return authFetch(accessToken, `/api/chat-sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'end', context }),
  });
}

export type TaskStatus = 'PENDING' | 'DONE';

export interface Task {
  id: string;
  sector: string;
  title: string;
  description: string;
  insight: string;
  status: TaskStatus;
  createdAt: string;
}

export function getTasks(accessToken: string, sector?: string): Promise<Task[]> {
  const qs = sector ? `?sector=${sector}` : '';
  return authFetch(accessToken, `/api/tasks${qs}`);
}

export function updateTaskStatus(accessToken: string, id: string, status: TaskStatus): Promise<Task> {
  return authFetch(accessToken, `/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

export function getUsers(accessToken: string): Promise<TeamMember[]> {
  return authFetch(accessToken, '/api/users');
}

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  status: UserStatus;
  createdAt: string;
}

// Lista completa (todos os status) — só admin, pra tela de gestão de usuários.
export function getAllUsers(accessToken: string): Promise<UserAccount[]> {
  return authFetch(accessToken, '/api/users/all');
}

export function createUser(
  accessToken: string,
  payload: { name: string; email: string; password: string; role: string },
): Promise<UserAccount> {
  return authFetch(accessToken, '/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// É assim que o admin dá (ou tira) poderes de admin de outra pessoa.
export function updateUserRole(accessToken: string, id: string, role: string): Promise<UserAccount> {
  return authFetch(accessToken, `/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export type AgentStatusValue = 'AVAILABLE' | 'PAUSED' | 'OFFLINE';

export interface AgentStatus {
  id: string;
  userId: string;
  status: AgentStatusValue;
  startedAt: string;
  endedAt: string | null;
}

export function getMyAgentStatus(accessToken: string): Promise<AgentStatus | null> {
  return authFetch(accessToken, '/api/agent-status/me');
}

export function setAgentStatus(accessToken: string, status: AgentStatusValue): Promise<AgentStatus> {
  return authFetch(accessToken, '/api/agent-status', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export type CallDirection = 'INBOUND' | 'OUTBOUND';

export interface Call {
  id: string;
  userId: string;
  clientId: string | null;
  contactName: string;
  phone: string;
  direction: CallDirection;
  startedAt: string;
  endedAt: string | null;
  transferredToUserId: string | null;
}

export function startCall(
  accessToken: string,
  payload: { contactName: string; phone: string; direction: CallDirection; clientId?: string },
): Promise<Call> {
  return authFetch(accessToken, '/api/calls', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// A ligação finalizada sempre vira um chamado automático — devolvido junto
// pra dar um link direto pro usuário revisar/editar.
export function endCall(accessToken: string, id: string): Promise<Call & { ticket: Ticket }> {
  return authFetch(accessToken, `/api/calls/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'end' }),
  });
}

export function transferCall(accessToken: string, id: string, toUserId: string): Promise<{ endedCall: Call; newCall: Call }> {
  return authFetch(accessToken, `/api/calls/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'transfer', toUserId }),
  });
}

export interface DashboardReports {
  range: { from: string; to: string };
  tickets: {
    total: number;
    byUser: { userId: string | null; userName: string; count: number }[];
    byClient: { clientId: string; clientName: string; count: number }[];
  };
  calls: {
    total: number;
    totalMinutes: number;
    byUser: { userId: string; userName: string; count: number; minutes: number }[];
    byClient: { clientId: string; clientName: string; count: number; minutes: number }[];
  };
  agentStatus: {
    byUser: { userId: string; userName: string; availableMinutes: number; pausedMinutes: number; offlineMinutes: number }[];
  };
}

export function getDashboardReports(
  accessToken: string,
  params: { from?: string; to?: string; userId?: string; clientId?: string } = {},
): Promise<DashboardReports> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.userId) query.set('userId', params.userId);
  if (params.clientId) query.set('clientId', params.clientId);
  const qs = query.toString();
  return authFetch(accessToken, `/api/dashboard/reports${qs ? `?${qs}` : ''}`);
}

export interface MonitorLive {
  activeCalls: { id: string; userId: string; userName: string; contactName: string; phone: string; startedAt: string }[];
  activeChats: { id: string; userId: string; userName: string; contactName: string; companyName: string | null; startedAt: string }[];
  agentStatus: { userId: string; userName: string; status: AgentStatusValue }[];
  counters: {
    calls: { today: number; week: number; month: number };
    tickets: { today: number; week: number; month: number };
  };
}

export function getMonitorLive(accessToken: string): Promise<MonitorLive> {
  return authFetch(accessToken, '/api/monitor/live');
}

// ---------- Chat interno (sala única por empresa) ----------

export type InternalMessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';

export interface InternalMessage {
  id: string;
  type: InternalMessageType;
  text: string | null;
  attachmentMimeType: string | null;
  attachmentFileName: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

export interface TeamStatusEntry {
  userId: string;
  name: string;
  status: AgentStatusValue;
}

export function getTeamStatus(accessToken: string): Promise<TeamStatusEntry[]> {
  return authFetch(accessToken, '/api/agent-status/team');
}

export function getInternalMessages(accessToken: string, sinceIso?: string): Promise<InternalMessage[]> {
  const qs = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : '';
  return authFetch(accessToken, `/api/internal-chat${qs}`);
}

export function sendInternalTextMessage(accessToken: string, text: string): Promise<InternalMessage> {
  return authFetch(accessToken, '/api/internal-chat', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// FormData, não JSON — não passa por authFetch (que sempre fixa
// Content-Type: application/json, o que corromperia o multipart).
export async function sendInternalAttachment(
  accessToken: string,
  file: Blob,
  filename: string,
  caption?: string,
): Promise<InternalMessage> {
  const formData = new FormData();
  formData.append('file', file, filename);
  if (caption) formData.append('text', caption);

  const res = await fetch(`${API_BASE_URL}/api/internal-chat/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? 'Erro ao enviar arquivo.');
  }
  return data as InternalMessage;
}

// <img>/<audio>/<video> não mandam header Authorization — baixa o anexo
// autenticado e devolve um object URL local pra usar no src.
export async function getInternalAttachmentUrl(accessToken: string, messageId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/internal-chat/attachments/${messageId}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Erro ao carregar anexo.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------- Assinatura (Asaas) ----------

export type PlanTier = 'STARTER' | 'PROFISSIONAL';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface Subscription {
  id: string;
  planTier: PlanTier;
  voiceAddonEnabled: boolean;
  status: SubscriptionStatus;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
}

export interface CheckoutPayload {
  planTier: PlanTier;
  voiceAddonEnabled: boolean;
  seatCount: number;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
}

export function checkout(accessToken: string, payload: CheckoutPayload): Promise<Subscription> {
  return authFetch(accessToken, '/api/billing/checkout', { method: 'POST', body: JSON.stringify(payload) });
}

export function getSubscription(accessToken: string): Promise<Subscription | null> {
  return authFetch(accessToken, '/api/billing/subscription');
}

// ---------- WhatsApp (Conversas real, via Baileys) ----------

export type WhatsAppConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED';

export interface WhatsAppStatus {
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  qrDataUrl: string | null;
}

export function getWhatsAppStatus(accessToken: string): Promise<WhatsAppStatus> {
  return authFetch(accessToken, '/api/whatsapp/status');
}

export function connectWhatsApp(accessToken: string): Promise<{ status: WhatsAppConnectionStatus }> {
  return authFetch(accessToken, '/api/whatsapp/connect', { method: 'POST' });
}

export function disconnectWhatsApp(accessToken: string): Promise<{ status: WhatsAppConnectionStatus }> {
  return authFetch(accessToken, '/api/whatsapp/disconnect', { method: 'POST' });
}

export type WhatsAppConversationStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

export interface WhatsAppConversation {
  id: string;
  remoteJid: string;
  contactName: string | null;
  contactPhone: string | null;
  queueId: string | null;
  queue: { id: string; name: string; colorClassName: string | null } | null;
  status: WhatsAppConversationStatus;
  claimedByUserId: string | null;
  claimedBy: { id: string; name: string } | null;
  claimedAt: string | null;
  chatSessionId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
}

export function getWhatsAppConversations(accessToken: string): Promise<WhatsAppConversation[]> {
  return authFetch(accessToken, '/api/whatsapp/conversations');
}

export function claimWhatsAppConversation(accessToken: string, id: string): Promise<WhatsAppConversation> {
  return authFetch(accessToken, `/api/whatsapp/conversations/${id}/claim`, { method: 'POST' });
}

export function transferWhatsAppConversation(
  accessToken: string,
  id: string,
  payload: { queueId?: string | null; claimedByUserId?: string | null },
): Promise<WhatsAppConversation> {
  return authFetch(accessToken, `/api/whatsapp/conversations/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function finishWhatsAppConversation(accessToken: string, id: string, context?: string): Promise<{ ticket: Ticket }> {
  return authFetch(accessToken, `/api/whatsapp/conversations/${id}/finish`, {
    method: 'POST',
    body: JSON.stringify({ context }),
  });
}

export type WhatsAppMessageDirection = 'IN' | 'OUT';

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  direction: WhatsAppMessageDirection;
  text: string | null;
  mediaMimeType: string | null;
  createdAt: string;
}

export function getWhatsAppMessages(accessToken: string, conversationId: string, sinceIso?: string): Promise<WhatsAppMessage[]> {
  const qs = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : '';
  return authFetch(accessToken, `/api/whatsapp/conversations/${conversationId}/messages${qs}`);
}

export function sendWhatsAppMessage(accessToken: string, conversationId: string, text: string): Promise<WhatsAppMessage> {
  return authFetch(accessToken, `/api/whatsapp/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// FormData, não JSON — mesmo motivo de sendInternalAttachment acima.
export async function sendWhatsAppAttachment(
  accessToken: string,
  conversationId: string,
  file: Blob,
  filename: string,
  caption?: string,
): Promise<WhatsAppMessage> {
  const formData = new FormData();
  formData.append('file', file, filename);
  if (caption) formData.append('text', caption);

  const res = await fetch(`${API_BASE_URL}/api/whatsapp/conversations/${conversationId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? 'Erro ao enviar arquivo.');
  }
  return data as WhatsAppMessage;
}

// <img>/<audio>/<video> não mandam header Authorization — mesmo padrão de
// getInternalAttachmentUrl acima.
export async function getWhatsAppAttachmentUrl(accessToken: string, messageId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/whatsapp/attachments/${messageId}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Erro ao carregar anexo.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  proto,
  useMultiFileAuthState,
  WAMessage,
  WASocket,
} from 'baileys';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// Baileys loga MUITO em debug/trace (frame a frame do protocolo) — um
// logger próprio, mais quieto, evita afogar o log do resto da API.
const waLogger = logger.child({ module: 'whatsapp' });
waLogger.level = 'warn';

const SESSIONS_ROOT = path.join(__dirname, '..', '..', '..', 'whatsapp-sessions');
export const WHATSAPP_UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads', 'whatsapp');
fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
fs.mkdirSync(WHATSAPP_UPLOADS_ROOT, { recursive: true });

interface SessionEntry {
  sock: WASocket;
  qrDataUrl: string | null;
}

// Um socket Baileys por tenant, em memória — não é algo que dá pra manter no
// banco (é uma conexão viva), só o status (WhatsAppConnection) é persistido.
const sessions = new Map<string, SessionEntry>();

function sessionDirFor(tenantId: string): string {
  return path.join(SESSIONS_ROOT, tenantId);
}

async function upsertConnectionStatus(
  tenantId: string,
  data: { status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED'; phoneNumber?: string | null; connectedAt?: Date | null },
) {
  await prisma.whatsAppConnection.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}

export function getSessionQr(tenantId: string): string | null {
  return sessions.get(tenantId)?.qrDataUrl ?? null;
}

export function isSessionActive(tenantId: string): boolean {
  return sessions.has(tenantId);
}

// Só grupos/status (@g.us, status@broadcast) são ignorados — o atendimento é
// sempre 1:1 com um contato (@s.whatsapp.net).
function isDirectContactJid(jid: string | null | undefined): jid is string {
  return !!jid && jid.endsWith('@s.whatsapp.net');
}

function phoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

async function findOrCreateConversation(tenantId: string, remoteJid: string, pushName: string | null | undefined) {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { tenantId_remoteJid: { tenantId, remoteJid } },
  });
  if (existing) return existing;

  return prisma.whatsAppConversation.create({
    data: {
      tenantId,
      remoteJid,
      contactName: pushName?.trim() || phoneFromJid(remoteJid),
      contactPhone: phoneFromJid(remoteJid),
    },
  });
}

interface ExtractedContent {
  text: string | null;
  mediaType: 'image' | 'audio' | 'video' | null;
  mimeType: string | null;
}

function extractContent(message: proto.IMessage | null | undefined): ExtractedContent {
  if (!message) return { text: null, mediaType: null, mimeType: null };

  if (message.conversation) return { text: message.conversation, mediaType: null, mimeType: null };
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, mediaType: null, mimeType: null };
  }
  if (message.imageMessage) {
    return { text: message.imageMessage.caption ?? null, mediaType: 'image', mimeType: message.imageMessage.mimetype ?? 'image/jpeg' };
  }
  if (message.videoMessage) {
    return { text: message.videoMessage.caption ?? null, mediaType: 'video', mimeType: message.videoMessage.mimetype ?? 'video/mp4' };
  }
  if (message.audioMessage) {
    return { text: null, mediaType: 'audio', mimeType: message.audioMessage.mimetype ?? 'audio/ogg' };
  }
  return { text: '[mensagem não suportada]', mediaType: null, mimeType: null };
}

function extensionForMimeType(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0];
  return subtype ? `.${subtype}` : '';
}

async function handleIncomingMessage(tenantId: string, sock: WASocket, waMessage: WAMessage) {
  // Mensagem mandada pelo próprio número direto no celular (fora do sistema)
  // também chega aqui com fromMe:true — as que o sistema manda
  // (sendTextMessage/sendMediaMessage) já são gravadas na hora do envio.
  if (waMessage.key.fromMe) return;

  const remoteJid = waMessage.key.remoteJid;
  if (!isDirectContactJid(remoteJid)) return; // ignora grupo/status/broadcast

  const contentType = getContentType(waMessage.message ?? undefined);
  if (!contentType) return;

  let conversation = await findOrCreateConversation(tenantId, remoteJid, waMessage.pushName);
  if (conversation.status === 'CLOSED') {
    // Cliente escreveu de novo depois do atendimento finalizado — reabre como
    // um atendimento novo, sem fila/responsável/ChatSession anteriores.
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { status: 'OPEN', queueId: null, claimedByUserId: null, claimedAt: null, chatSessionId: null },
    });
  }

  const { text, mediaType, mimeType } = extractContent(waMessage.message);

  let mediaPath: string | null = null;
  let mediaMimeType: string | null = null;

  if (mediaType && mimeType) {
    try {
      const buffer = (await downloadMediaMessage(waMessage, 'buffer', {}, { logger: waLogger, reuploadRequest: sock.updateMediaMessage })) as Buffer;
      const dir = path.join(WHATSAPP_UPLOADS_ROOT, tenantId);
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${randomUUID()}${extensionForMimeType(mimeType)}`;
      fs.writeFileSync(path.join(dir, fileName), buffer);
      mediaPath = path.join(tenantId, fileName);
      mediaMimeType = mimeType;
    } catch (err) {
      waLogger.error({ err }, 'Falha ao baixar mídia recebida do WhatsApp');
    }
  }

  await prisma.$transaction([
    prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        waMessageId: waMessage.key.id,
        direction: 'IN',
        text,
        mediaPath,
        mediaMimeType,
      },
    }),
    prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text ?? (mediaType ? '[mídia]' : null),
        unreadCount: { increment: 1 },
      },
    }),
  ]);
}

export async function startSession(tenantId: string): Promise<void> {
  if (sessions.has(tenantId)) return; // já conectando/conectado

  const dir = sessionDirFor(tenantId);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version, logger: waLogger });
  sessions.set(tenantId, { sock, qrDataUrl: null });
  await upsertConnectionStatus(tenantId, { status: 'CONNECTING' });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const entry = sessions.get(tenantId);

    if (qr && entry) {
      entry.qrDataUrl = await QRCode.toDataURL(qr);
      await upsertConnectionStatus(tenantId, { status: 'QR_PENDING' });
    }

    if (connection === 'open') {
      const phoneNumber = sock.user?.id ? phoneFromJid(sock.user.id) : null;
      if (entry) entry.qrDataUrl = null;
      await upsertConnectionStatus(tenantId, { status: 'CONNECTED', phoneNumber, connectedAt: new Date() });
      waLogger.info({ event: 'whatsapp.connected', tenantId, phoneNumber }, 'WhatsApp conectado.');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(tenantId);

      if (loggedOut) {
        fs.rmSync(dir, { recursive: true, force: true });
        await upsertConnectionStatus(tenantId, { status: 'DISCONNECTED', phoneNumber: null, connectedAt: null });
        waLogger.warn({ event: 'whatsapp.logged_out', tenantId }, 'WhatsApp desconectado (logout) — precisa escanear o QR de novo.');
      } else {
        // Queda de rede/reinício — reconecta sozinho com as credenciais que
        // já existem em disco, sem pedir QR de novo.
        await upsertConnectionStatus(tenantId, { status: 'CONNECTING' });
        waLogger.warn({ event: 'whatsapp.disconnected_retrying', tenantId, statusCode }, 'WhatsApp caiu — tentando reconectar sozinho.');
        void startSession(tenantId);
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      handleIncomingMessage(tenantId, sock, message).catch((err) =>
        waLogger.error({ err }, 'Falha ao processar mensagem recebida do WhatsApp'),
      );
    }
  });
}

export async function logoutSession(tenantId: string): Promise<void> {
  const entry = sessions.get(tenantId);
  if (entry) {
    try {
      await entry.sock.logout();
    } catch {
      // Se já estiver desconectado, logout pode falhar — segue o fluxo, o
      // importante é limpar a sessão local abaixo de qualquer jeito.
    }
    sessions.delete(tenantId);
  }
  fs.rmSync(sessionDirFor(tenantId), { recursive: true, force: true });
  await upsertConnectionStatus(tenantId, { status: 'DISCONNECTED', phoneNumber: null, connectedAt: null });
}

// Chamado uma vez no boot do backend — reconecta sozinho todo tenant que já
// estava conectado antes do restart (as credenciais continuam em disco).
export async function resumeAllSessions(): Promise<void> {
  const connected = await prisma.whatsAppConnection.findMany({ where: { status: 'CONNECTED' } });
  for (const connection of connected) {
    void startSession(connection.tenantId);
  }
}

function requireSocket(tenantId: string): WASocket {
  const entry = sessions.get(tenantId);
  if (!entry) {
    throw new Error('WhatsApp não está conectado para este tenant.');
  }
  return entry.sock;
}

export async function sendTextMessage(tenantId: string, remoteJid: string, text: string): Promise<string | null> {
  const sock = requireSocket(tenantId);
  const result = await sock.sendMessage(remoteJid, { text });
  return result?.key.id ?? null;
}

export async function sendMediaMessage(
  tenantId: string,
  remoteJid: string,
  file: { buffer: Buffer; mimetype: string },
  caption?: string,
): Promise<string | null> {
  const sock = requireSocket(tenantId);

  let result;
  if (file.mimetype.startsWith('image/')) {
    result = await sock.sendMessage(remoteJid, { image: file.buffer, caption, mimetype: file.mimetype });
  } else if (file.mimetype.startsWith('video/')) {
    result = await sock.sendMessage(remoteJid, { video: file.buffer, caption, mimetype: file.mimetype });
  } else if (file.mimetype.startsWith('audio/')) {
    result = await sock.sendMessage(remoteJid, { audio: file.buffer, mimetype: file.mimetype, ptt: true });
  } else {
    throw new Error('Tipo de arquivo não suportado.');
  }

  return result?.key.id ?? null;
}

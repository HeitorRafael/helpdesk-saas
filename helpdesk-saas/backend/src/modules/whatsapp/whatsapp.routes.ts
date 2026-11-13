import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { createTicketFromAttendance } from '../tickets/tickets.service';
import { finishConversationSchema, sendTextMessageSchema, transferConversationSchema } from './whatsapp.validators';
import {
  getSessionQr,
  logoutSession,
  sendMediaMessage,
  sendTextMessage,
  startSession,
  WHATSAPP_UPLOADS_ROOT,
} from './whatsapp.service';

export const whatsappRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (/^(image|audio|video)\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado — só foto, áudio ou vídeo.'));
    }
  },
});

// Multer reporta erro via callback, não via rejeição de Promise — mesmo
// wrapper usado em internal-chat.routes.ts.
function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máximo 25MB).' : 'Erro ao enviar o arquivo.';
      return next(new AppError(400, message));
    }
    if (err instanceof Error) {
      return next(new AppError(400, err.message));
    }
    return next();
  });
}

const CONVERSATION_INCLUDE = {
  queue: { select: { id: true, name: true, colorClassName: true } },
  claimedBy: { select: { id: true, name: true } },
} as const;

// --- Conexão (admin) ---

whatsappRouter.post(
  '/connect',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    await startSession(req.auth!.tenantId);
    return res.status(202).json({ status: 'CONNECTING' });
  }),
);

whatsappRouter.get(
  '/status',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const connection = await prisma.whatsAppConnection.findUnique({ where: { tenantId } });
    return res.json({
      status: connection?.status ?? 'DISCONNECTED',
      phoneNumber: connection?.phoneNumber ?? null,
      qrDataUrl: getSessionQr(tenantId),
    });
  }),
);

whatsappRouter.post(
  '/disconnect',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    await logoutSession(req.auth!.tenantId);
    return res.json({ status: 'DISCONNECTED' });
  }),
);

// --- Conversas ---

// Sem filtro de aba no servidor — o front já sabe filtrar mine/queue/all
// localmente (mesma lógica que já existia sobre o mock); aqui só devolve o
// conjunto recente de conversas do tenant.
whatsappRouter.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const conversations = await prisma.whatsAppConversation.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: CONVERSATION_INCLUDE,
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });
    return res.json(conversations);
  }),
);

whatsappRouter.post(
  '/conversations/:id/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!conversation) {
      throw new AppError(404, 'Conversa não encontrada.');
    }
    if (conversation.status !== 'OPEN') {
      throw new AppError(409, 'Essa conversa já foi pega por outra pessoa.');
    }

    const chatSession = await prisma.chatSession.create({
      data: {
        tenantId,
        userId: req.auth!.userId,
        contactName: conversation.contactName ?? conversation.remoteJid,
      },
    });

    const updated = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'IN_PROGRESS',
        claimedByUserId: req.auth!.userId,
        claimedAt: new Date(),
        chatSessionId: chatSession.id,
        unreadCount: 0,
      },
      include: CONVERSATION_INCLUDE,
    });
    return res.json(updated);
  }),
);

whatsappRouter.post(
  '/conversations/:id/transfer',
  requireAuth,
  validateBody(transferConversationSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!conversation) {
      throw new AppError(404, 'Conversa não encontrada.');
    }

    if (req.body.queueId) {
      const queue = await prisma.queue.findFirst({ where: { id: req.body.queueId, tenantId } });
      if (!queue) throw new AppError(400, 'Fila inválida.');
    }
    if (req.body.claimedByUserId) {
      const user = await prisma.user.findFirst({ where: { id: req.body.claimedByUserId, tenantId } });
      if (!user) throw new AppError(400, 'Usuário inválido.');
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { queueId: req.body.queueId, claimedByUserId: req.body.claimedByUserId },
      include: CONVERSATION_INCLUDE,
    });
    return res.json(updated);
  }),
);

whatsappRouter.post(
  '/conversations/:id/finish',
  requireAuth,
  validateBody(finishConversationSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id: req.params.id, tenantId },
      include: { chatSession: true },
    });
    if (!conversation || !conversation.chatSession) {
      throw new AppError(404, 'Conversa não encontrada ou ainda não foi pega.');
    }

    const endedAt = new Date();
    await prisma.chatSession.update({ where: { id: conversation.chatSession.id }, data: { endedAt } });

    const ticket = await createTicketFromAttendance({
      tenantId,
      userId: req.auth!.userId,
      source: 'CHAT',
      clientId: conversation.chatSession.clientId,
      contactName: conversation.contactName ?? conversation.remoteJid,
      contactPhone: conversation.contactPhone,
      startedAt: conversation.chatSession.startedAt,
      endedAt,
      context: req.body.context,
    });

    await prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { status: 'CLOSED' } });

    return res.json({ ticket });
  }),
);

whatsappRouter.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!conversation) {
      throw new AppError(404, 'Conversa não encontrada.');
    }

    const sinceRaw = typeof req.query.since === 'string' ? new Date(req.query.since) : null;
    const since = sinceRaw && !Number.isNaN(sinceRaw.getTime()) ? sinceRaw : null;

    if (since) {
      const messages = await prisma.whatsAppMessage.findMany({
        where: { conversationId: conversation.id, tenantId, createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
      });
      return res.json(messages);
    }

    const recent = await prisma.whatsAppMessage.findMany({
      where: { conversationId: conversation.id, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(recent.reverse());
  }),
);

whatsappRouter.post(
  '/conversations/:id/messages',
  requireAuth,
  validateBody(sendTextMessageSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!conversation) {
      throw new AppError(404, 'Conversa não encontrada.');
    }

    const waMessageId = await sendTextMessage(tenantId, conversation.remoteJid, req.body.text).catch((err) => {
      throw new AppError(409, err instanceof Error ? err.message : 'Erro ao enviar mensagem pelo WhatsApp.');
    });

    const [message] = await prisma.$transaction([
      prisma.whatsAppMessage.create({
        data: { tenantId, conversationId: conversation.id, waMessageId, direction: 'OUT', text: req.body.text },
      }),
      prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), lastMessagePreview: req.body.text },
      }),
    ]);

    return res.status(201).json(message);
  }),
);

whatsappRouter.post(
  '/conversations/:id/attachments',
  requireAuth,
  uploadSingleFile,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!conversation) {
      throw new AppError(404, 'Conversa não encontrada.');
    }

    const file = req.file;
    if (!file) {
      throw new AppError(400, 'Nenhum arquivo enviado.');
    }
    const caption = typeof req.body.text === 'string' && req.body.text.trim() ? req.body.text.trim() : undefined;

    const waMessageId = await sendMediaMessage(tenantId, conversation.remoteJid, { buffer: file.buffer, mimetype: file.mimetype }, caption).catch(
      (err) => {
        throw new AppError(409, err instanceof Error ? err.message : 'Erro ao enviar arquivo pelo WhatsApp.');
      },
    );

    const extension = path.extname(file.originalname) || '';
    const fileName = `${(waMessageId ?? Date.now().toString())}${extension}`;
    const dir = path.join(WHATSAPP_UPLOADS_ROOT, tenantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), file.buffer);

    const [message] = await prisma.$transaction([
      prisma.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          waMessageId,
          direction: 'OUT',
          text: caption,
          mediaPath: path.join(tenantId, fileName),
          mediaMimeType: file.mimetype,
        },
      }),
      prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), lastMessagePreview: caption ?? '[mídia]' },
      }),
    ]);

    return res.status(201).json(message);
  }),
);

// Nunca por rota estática — sempre checa que a mensagem (e o anexo) é deste
// tenant antes de entregar o arquivo, mesmo padrão do chat interno.
whatsappRouter.get(
  '/attachments/:messageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const message = await prisma.whatsAppMessage.findFirst({
      where: { id: req.params.messageId, tenantId: req.auth!.tenantId },
    });
    if (!message || !message.mediaPath) {
      throw new AppError(404, 'Anexo não encontrado.');
    }

    const absolutePath = path.join(WHATSAPP_UPLOADS_ROOT, message.mediaPath);
    res.type(message.mediaMimeType ?? 'application/octet-stream');
    return res.sendFile(absolutePath);
  }),
);

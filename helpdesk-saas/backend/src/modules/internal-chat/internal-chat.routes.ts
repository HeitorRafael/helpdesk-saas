import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { InternalMessageType } from '@prisma/client';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { sendTextMessageSchema } from './internal-chat.validators';

export const internalChatRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Raiz de todos os anexos — nunca servida por rota estática; só entregue
// via GET /attachments/:messageId, que confere o tenant dono antes.
const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads', 'internal-chat');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.auth!.tenantId;
      const dir = path.join(UPLOADS_ROOT, tenantId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (/^(image|audio|video)\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado — só foto, áudio ou vídeo.'));
    }
  },
});

// Multer reporta erro via callback, não via rejeição de Promise — não dá
// pra só usar asyncHandler aqui. Convertido pra AppError pra manter a
// mesma mensagem clara de erro do resto da API.
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

function messageTypeFromMimeType(mimeType: string): InternalMessageType {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'VIDEO';
}

// Sala única por tenant — sem conceito de "conversa", todo mundo do tenant
// vê e manda nas mesmas mensagens.
internalChatRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const sinceRaw = typeof req.query.since === 'string' ? new Date(req.query.since) : null;
    const since = sinceRaw && !Number.isNaN(sinceRaw.getTime()) ? sinceRaw : null;

    if (since) {
      // Poll incremental — só o que chegou depois da última mensagem que o
      // front já tem.
      const messages = await prisma.internalMessage.findMany({
        where: { tenantId, createdAt: { gt: since } },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return res.json(messages);
    }

    const recent = await prisma.internalMessage.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(recent.reverse());
  }),
);

internalChatRouter.post(
  '/',
  requireAuth,
  validateBody(sendTextMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await prisma.internalMessage.create({
      data: {
        tenantId: req.auth!.tenantId,
        userId: req.auth!.userId,
        type: 'TEXT',
        text: req.body.text,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return res.status(201).json(message);
  }),
);

internalChatRouter.post(
  '/attachments',
  requireAuth,
  uploadSingleFile,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new AppError(400, 'Nenhum arquivo enviado.');
    }

    const caption = typeof req.body.text === 'string' && req.body.text.trim() ? req.body.text.trim() : undefined;

    const message = await prisma.internalMessage.create({
      data: {
        tenantId: req.auth!.tenantId,
        userId: req.auth!.userId,
        type: messageTypeFromMimeType(file.mimetype),
        text: caption,
        attachmentPath: path.join(req.auth!.tenantId, file.filename),
        attachmentMimeType: file.mimetype,
        attachmentFileName: file.originalname,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return res.status(201).json(message);
  }),
);

// Nunca por rota estática — sempre checa que a mensagem (e o anexo) é
// deste tenant antes de entregar o arquivo.
internalChatRouter.get(
  '/attachments/:messageId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const message = await prisma.internalMessage.findFirst({
      where: { id: req.params.messageId, tenantId: req.auth!.tenantId },
    });

    if (!message || !message.attachmentPath) {
      throw new AppError(404, 'Anexo não encontrado.');
    }

    const absolutePath = path.join(UPLOADS_ROOT, message.attachmentPath);
    res.type(message.attachmentMimeType ?? 'application/octet-stream');
    return res.sendFile(absolutePath);
  }),
);

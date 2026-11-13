import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { claimChatSessionSchema, endChatSessionSchema } from './chat-sessions.validators';
import { createTicketFromAttendance } from '../tickets/tickets.service';

export const chatSessionsRouter = Router();

// "Pegar atendimento" em Conversas cria essa sessão leve — é o que faz o
// chat aparecer no Monitor em tempo real (junto com as chamadas).
chatSessionsRouter.post(
  '/',
  requireAuth,
  validateBody(claimChatSessionSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    // Mesmo motivo do calls.routes.ts: clientId vem do body, tem que
    // pertencer a este tenant antes de gravar.
    if (req.body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: req.body.clientId, tenantId } });
      if (!client) {
        throw new AppError(400, 'Cliente inválido.');
      }
    }

    const session = await prisma.chatSession.create({
      data: {
        tenantId,
        userId: req.auth!.userId,
        contactName: req.body.contactName,
        companyName: req.body.companyName,
        clientId: req.body.clientId,
      },
    });
    return res.status(201).json(session);
  }),
);

chatSessionsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(endChatSessionSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, tenantId, userId: req.auth!.userId, endedAt: null },
    });
    if (!session) {
      throw new AppError(404, 'Atendimento não encontrado ou já finalizado.');
    }

    const endedAt = new Date();
    await prisma.chatSession.update({ where: { id: session.id }, data: { endedAt } });

    const ticket = await createTicketFromAttendance({
      tenantId,
      userId: req.auth!.userId,
      source: 'CHAT',
      clientId: session.clientId,
      contactName: session.contactName,
      startedAt: session.startedAt,
      endedAt,
      context: req.body.context,
    });

    return res.json({ ticket });
  }),
);

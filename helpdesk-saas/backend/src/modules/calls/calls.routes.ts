import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { startCallSchema, updateCallSchema } from './calls.validators';
import { createTicketFromAttendance } from '../tickets/tickets.service';

export const callsRouter = Router();

callsRouter.post(
  '/',
  requireAuth,
  validateBody(startCallSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    // clientId vem do body — nunca confiar sem checar que pertence a este
    // tenant, senão um id de cliente de outra empresa vaza nome/telefone
    // dela pra quem finalizar a chamada (o chamado gerado inclui o client).
    if (req.body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: req.body.clientId, tenantId } });
      if (!client) {
        throw new AppError(400, 'Cliente inválido.');
      }
    }

    const call = await prisma.call.create({
      data: {
        tenantId,
        userId: req.auth!.userId,
        contactName: req.body.contactName,
        phone: req.body.phone,
        direction: req.body.direction,
        clientId: req.body.clientId,
      },
    });

    return res.status(201).json(call);
  }),
);

callsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateCallSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    // Só quem está com a chamada pode encerrar/transferir — mesmo motivo de
    // segurança do resto do app: nunca confiar em id vindo só da URL/body.
    const call = await prisma.call.findFirst({
      where: { id: req.params.id, tenantId, userId: req.auth!.userId, endedAt: null },
    });

    if (!call) {
      throw new AppError(404, 'Chamada não encontrada ou já encerrada.');
    }

    if (req.body.action === 'end') {
      const endedAt = new Date();
      const updated = await prisma.call.update({ where: { id: call.id }, data: { endedAt } });

      // Toda ligação finalizada vira um chamado automaticamente — a IA
      // preenche o resumo se o tenant tiver chave configurada.
      const ticket = await createTicketFromAttendance({
        tenantId,
        userId: req.auth!.userId,
        source: 'CALL',
        clientId: call.clientId,
        contactName: call.contactName,
        contactPhone: call.phone,
        startedAt: call.startedAt,
        endedAt,
      });

      return res.json({ ...updated, ticket });
    }

    const target = await prisma.user.findFirst({ where: { id: req.body.toUserId, tenantId } });
    if (!target) {
      throw new AppError(400, 'Usuário de destino inválido.');
    }

    const now = new Date();
    const [endedCall, newCall] = await prisma.$transaction([
      prisma.call.update({ where: { id: call.id }, data: { endedAt: now, transferredToUserId: target.id } }),
      prisma.call.create({
        data: {
          tenantId,
          userId: target.id,
          clientId: call.clientId,
          contactName: call.contactName,
          phone: call.phone,
          direction: call.direction,
          startedAt: now,
        },
      }),
    ]);

    return res.json({ endedCall, newCall });
  }),
);

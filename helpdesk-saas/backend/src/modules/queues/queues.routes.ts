import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { createQueueSchema, updateQueueSchema } from './queues.validators';

export const queuesRouter = Router();

// Mesma paleta que já existia no mock do front (queues-mock.ts) — ciclada
// quando o admin não escolhe uma cor na criação.
const DEFAULT_COLORS = [
  'bg-blue-mid/10 text-blue-deep',
  'bg-green-mid/10 text-green-deep',
  'bg-chrome-2/20 text-chrome-3',
  'bg-ink-soft/10 text-ink-soft',
];

// memberUserIds vem do body — sem checar, um id de usuário de outro tenant
// entraria em QueueMember (some no board, mas é o mesmo tipo de furo que os
// clientId de calls/chat-sessions: nunca confiar em id de fora sem validar).
async function assertMembersBelongToTenant(tenantId: string, memberUserIds: string[]) {
  if (memberUserIds.length === 0) return;
  const count = await prisma.user.count({ where: { tenantId, id: { in: memberUserIds } } });
  if (count !== new Set(memberUserIds).size) {
    throw new AppError(400, 'Um ou mais usuários informados são inválidos.');
  }
}

function serializeQueue(queue: { id: string; name: string; colorClassName: string | null; members: { userId: string }[] }) {
  return {
    id: queue.id,
    name: queue.name,
    colorClassName: queue.colorClassName,
    memberUserIds: queue.members.map((m) => m.userId),
  };
}

// GET liberado pra todo mundo autenticado — Conversas precisa buscar as
// filas pra listar/filtrar; só criar/editar/apagar é admin.
queuesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const queues = await prisma.queue.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { members: { select: { userId: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json(queues.map(serializeQueue));
  }),
);

queuesRouter.post(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(createQueueSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const existing = await prisma.queue.findFirst({
      where: { tenantId, name: { equals: req.body.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError(409, 'Já existe uma fila com esse nome.');
    }

    if (req.body.memberUserIds) {
      await assertMembersBelongToTenant(tenantId, req.body.memberUserIds);
    }

    const count = await prisma.queue.count({ where: { tenantId } });
    const colorClassName = req.body.colorClassName ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length];

    const queue = await prisma.queue.create({
      data: {
        tenantId,
        name: req.body.name,
        colorClassName,
        members: req.body.memberUserIds
          ? { create: req.body.memberUserIds.map((userId: string) => ({ tenantId, userId })) }
          : undefined,
      },
      include: { members: { select: { userId: true } } },
    });

    return res.status(201).json(serializeQueue(queue));
  }),
);

queuesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(updateQueueSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const queue = await prisma.queue.findFirst({ where: { id: req.params.id, tenantId } });
    if (!queue) {
      throw new AppError(404, 'Fila não encontrada.');
    }

    if (req.body.memberUserIds) {
      await assertMembersBelongToTenant(tenantId, req.body.memberUserIds);
      // Substitui a lista inteira de membros — mais simples e previsível do
      // que calcular diff de add/remove pra uma tela de admin.
      await prisma.queueMember.deleteMany({ where: { queueId: queue.id } });
      if (req.body.memberUserIds.length > 0) {
        await prisma.queueMember.createMany({
          data: req.body.memberUserIds.map((userId: string) => ({ tenantId, queueId: queue.id, userId })),
        });
      }
    }

    const updated = await prisma.queue.update({
      where: { id: queue.id },
      data: { name: req.body.name, colorClassName: req.body.colorClassName },
      include: { members: { select: { userId: true } } },
    });

    return res.json(serializeQueue(updated));
  }),
);

queuesRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const queue = await prisma.queue.findFirst({ where: { id: req.params.id, tenantId } });
    if (!queue) {
      throw new AppError(404, 'Fila não encontrada.');
    }

    await prisma.queue.delete({ where: { id: queue.id } });
    return res.status(204).send();
  }),
);

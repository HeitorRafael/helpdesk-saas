import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { setAgentStatusSchema } from './agent-status.validators';

export const agentStatusRouter = Router();

// Sempre no máximo um log "aberto" (endedAt null) por usuário — a duração de
// cada status é o intervalo entre startedAt e endedAt (ou "agora", se ainda
// aberto). É a partir disso que o dashboard soma tempo disponível/pausado/offline.
agentStatusRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = await prisma.agentStatusLog.findFirst({
      where: { tenantId: req.auth!.tenantId, userId: req.auth!.userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    return res.json(current);
  }),
);

// Status atual de todo mundo do tenant — usado pra bolinha ao lado do nome
// no chat interno (mesma lógica de "equipe agora" já usada no Monitor).
agentStatusRouter.get(
  '/team',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const [users, openLogs] = await Promise.all([
      prisma.user.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, name: true } }),
      prisma.agentStatusLog.findMany({ where: { tenantId, endedAt: null } }),
    ]);

    return res.json(
      users.map((user) => ({
        userId: user.id,
        name: user.name,
        status: openLogs.find((l) => l.userId === user.id)?.status ?? 'OFFLINE',
      })),
    );
  }),
);

agentStatusRouter.post(
  '/',
  requireAuth,
  validateBody(setAgentStatusSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const userId = req.auth!.userId;
    const now = new Date();

    await prisma.agentStatusLog.updateMany({
      where: { tenantId, userId, endedAt: null },
      data: { endedAt: now },
    });

    const created = await prisma.agentStatusLog.create({
      data: { tenantId, userId, status: req.body.status, startedAt: now },
    });

    return res.status(201).json(created);
  }),
);

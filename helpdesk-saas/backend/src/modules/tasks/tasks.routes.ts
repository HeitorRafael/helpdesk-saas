import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { updateTaskStatusSchema } from './tasks.validators';

export const tasksRouter = Router();

const VALID_SECTORS: readonly string[] = ['ADMIN', 'GERENCIA', 'SUPORTE', 'FINANCEIRO', 'RH'];

function parseSector(value: unknown): Role | undefined {
  if (typeof value === 'string' && VALID_SECTORS.includes(value)) {
    return value as Role;
  }
  return undefined;
}

// Tarefas "geradas por IA" a partir de padrões nos tickets — nesta fase o
// conteúdo vem sempre do seed, simulando o que a IA real vai produzir depois.
tasksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const sector = parseSector(req.query.sector);

    const tasks = await prisma.task.findMany({
      where: { tenantId, sector },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(tasks);
  }),
);

tasksRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateTaskStatusSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const task = await prisma.task.findFirst({ where: { id: req.params.id, tenantId } });
    if (!task) {
      return res.status(404).json({ error: 'Tarefa não encontrada.' });
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: req.body.status },
    });

    return res.json(updated);
  }),
);

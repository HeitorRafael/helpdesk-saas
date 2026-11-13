import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { createTicketTypeSchema } from './ticket-types.validators';

export const ticketTypesRouter = Router();

// GET é liberado pra todo mundo autenticado — usado nos filtros da lista de
// chamados e no seletor de tipo do detalhe. Só criar/apagar é admin.
ticketTypesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ticketTypes = await prisma.ticketType.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { name: 'asc' },
    });
    return res.json(ticketTypes);
  }),
);

ticketTypesRouter.post(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(createTicketTypeSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const existing = await prisma.ticketType.findFirst({
      where: { tenantId, name: { equals: req.body.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError(409, 'Já existe um tipo de atendimento com esse nome.');
    }

    const ticketType = await prisma.ticketType.create({ data: { tenantId, name: req.body.name } });
    return res.status(201).json(ticketType);
  }),
);

ticketTypesRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const ticketType = await prisma.ticketType.findFirst({ where: { id: req.params.id, tenantId } });
    if (!ticketType) {
      throw new AppError(404, 'Tipo de atendimento não encontrado.');
    }

    // Chamados que usavam esse tipo ficam sem tipo (onDelete: SetNull no schema) —
    // preserva o histórico em vez de apagar o chamado junto.
    await prisma.ticketType.delete({ where: { id: ticketType.id } });
    return res.status(204).send();
  }),
);

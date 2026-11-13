import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { createSectorSchema } from './sectors.validators';

export const sectorsRouter = Router();

// GET liberado pra todo mundo autenticado — usado no filtro da lista de
// chamados e no seletor de "encaminhar pro setor" do detalhe. Só
// criar/apagar é admin.
sectorsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sectors = await prisma.sector.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { name: 'asc' },
    });
    return res.json(sectors);
  }),
);

sectorsRouter.post(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(createSectorSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const existing = await prisma.sector.findFirst({
      where: { tenantId, name: { equals: req.body.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError(409, 'Já existe um setor com esse nome.');
    }

    const sector = await prisma.sector.create({ data: { tenantId, name: req.body.name } });
    return res.status(201).json(sector);
  }),
);

sectorsRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const sector = await prisma.sector.findFirst({ where: { id: req.params.id, tenantId } });
    if (!sector) {
      throw new AppError(404, 'Setor não encontrado.');
    }

    // Chamados que usavam esse setor ficam sem setor (onDelete: SetNull no
    // schema) — preserva o histórico em vez de apagar o chamado junto.
    await prisma.sector.delete({ where: { id: sector.id } });
    return res.status(204).send();
  }),
);

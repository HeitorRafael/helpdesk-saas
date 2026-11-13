import { Router } from 'express';
import { ClientStatus } from '@prisma/client';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { addClientAttributeSchema, createClientSchema } from './clients.validators';

export const clientsRouter = Router();

const VALID_STATUSES: readonly string[] = ['ACTIVE', 'INACTIVE'];

function parseStatus(value: unknown): ClientStatus | undefined {
  if (typeof value === 'string' && VALID_STATUSES.includes(value)) {
    return value as ClientStatus;
  }
  return undefined;
}

// Lista de clientes ranqueada por volume de chamados — resolve a dor real de
// clientes antigos/inativos poluindo a busca (filtro de status no frontend
// vem com "Ativos" como padrão).
clientsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const status = parseStatus(req.query.status);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const clients = await prisma.client.findMany({
      where: {
        tenantId,
        status,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { tickets: true } } },
      orderBy: { tickets: { _count: 'desc' } },
    });

    return res.json(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        cnpj: client.cnpj,
        status: client.status,
        ticketCount: client._count.tickets,
        createdAt: client.createdAt,
      })),
    );
  }),
);

clientsRouter.post(
  '/',
  requireAuth,
  validateBody(createClientSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const client = await prisma.client.create({
      data: {
        tenantId,
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        cnpj: req.body.cnpj,
        // ClientAttribute tem sua própria FK direta pro Tenant (mesmo padrão
        // do resto do schema) — o create aninhado não preenche sozinho.
        attributes: req.body.attributes
          ? { create: req.body.attributes.map((a: { name: string; value: string }) => ({ ...a, tenantId })) }
          : undefined,
      },
      include: { attributes: true },
    });

    return res.status(201).json(client);
  }),
);

clientsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    // findFirst por id+tenantId, nunca findUnique só por id — impede um
    // usuário de um tenant enxergar cliente de outro trocando o :id na URL.
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        tickets: { orderBy: { createdAt: 'desc' }, include: { ticketType: { select: { id: true, name: true } } } },
        attributes: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    return res.json(client);
  }),
);

clientsRouter.post(
  '/:id/attributes',
  requireAuth,
  validateBody(addClientAttributeSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const client = await prisma.client.findFirst({ where: { id: req.params.id, tenantId } });
    if (!client) {
      throw new AppError(404, 'Cliente não encontrado.');
    }

    const attribute = await prisma.clientAttribute.create({
      data: { tenantId, clientId: client.id, name: req.body.name, value: req.body.value },
    });

    return res.status(201).json(attribute);
  }),
);

clientsRouter.delete(
  '/:id/attributes/:attributeId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const attribute = await prisma.clientAttribute.findFirst({
      where: { id: req.params.attributeId, clientId: req.params.id, tenantId },
    });
    if (!attribute) {
      throw new AppError(404, 'Característica não encontrada.');
    }

    await prisma.clientAttribute.delete({ where: { id: attribute.id } });
    return res.status(204).send();
  }),
);

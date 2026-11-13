import { Router } from 'express';
import { Prisma, Ticket, TicketEventType, TicketStatus } from '@prisma/client';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { createTicketFromAttendanceSchema, updateTicketSchema } from './tickets.validators';
import { createTicketFromAttendance } from './tickets.service';
import { generateTicketInsight } from '../ai/ai.service';

export const ticketsRouter = Router();

const VALID_STATUSES: readonly string[] = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
const MAX_PAGE_SIZE = 50;

function parseStatus(value: unknown): TicketStatus | undefined {
  return typeof value === 'string' && VALID_STATUSES.includes(value) ? (value as TicketStatus) : undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
}

// Trilha de auditoria — cada campo que muda no PATCH vira um TicketEvent
// (append-only), pra sempre dar pra saber quem mudou o quê e quando. Só
// compara os campos que vieram no body: os que não vieram continuam undefined
// e não geram evento.
function buildTicketEvents(
  ticket: Ticket,
  body: { status?: TicketStatus; handledByUserId?: string | null; sectorId?: string | null; ticketTypeId?: string | null; resolutionNotes?: string },
  userId: string,
): Prisma.TicketEventCreateManyInput[] {
  const events: Prisma.TicketEventCreateManyInput[] = [];

  function push(type: TicketEventType, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;
    events.push({ tenantId: ticket.tenantId, ticketId: ticket.id, userId, type, oldValue, newValue });
  }

  if (body.status !== undefined) push('STATUS_CHANGED', ticket.status, body.status);
  if (body.handledByUserId !== undefined) push('ASSIGNEE_CHANGED', ticket.handledByUserId, body.handledByUserId);
  if (body.sectorId !== undefined) push('SECTOR_CHANGED', ticket.sectorId, body.sectorId);
  if (body.ticketTypeId !== undefined) push('TYPE_CHANGED', ticket.ticketTypeId, body.ticketTypeId);
  if (body.resolutionNotes !== undefined) push('NOTES_EDITED', ticket.resolutionNotes, body.resolutionNotes);

  return events;
}

// Lista paginada e filtrável — pensada pra voltar num chamado específico
// depois (por usuário, data, tipo, status, cliente), sem infinite scroll.
ticketsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, MAX_PAGE_SIZE);

    const status = parseStatus(req.query.status);
    const ticketTypeId = parseString(req.query.ticketTypeId);
    const sectorId = parseString(req.query.sectorId);
    const handledByUserId = parseString(req.query.handledByUserId);
    const clientId = parseString(req.query.clientId);
    const search = parseString(req.query.search);
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const where: Prisma.TicketWhereInput = {
      tenantId,
      status,
      ticketTypeId,
      sectorId,
      handledByUserId,
      clientId,
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(search ? { subject: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          ticketType: { select: { id: true, name: true } },
          sector: { select: { id: true, name: true } },
          handledBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ]);

    return res.json({ items, total, page, pageSize });
  }),
);

ticketsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        ticketType: { select: { id: true, name: true } },
        sector: { select: { id: true, name: true } },
        handledBy: { select: { id: true, name: true } },
      },
    });

    if (!ticket) {
      throw new AppError(404, 'Chamado não encontrado.');
    }

    return res.json(ticket);
  }),
);

// Usado pelo front ao finalizar um chat (Conversas) — a criação a partir de
// uma ligação acontece direto em calls.routes.ts, sem precisar dessa rota.
ticketsRouter.post(
  '/',
  requireAuth,
  validateBody(createTicketFromAttendanceSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    if (req.body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: req.body.clientId, tenantId } });
      if (!client) {
        throw new AppError(400, 'Cliente inválido.');
      }
    }

    const ticket = await createTicketFromAttendance({
      tenantId,
      userId: req.auth!.userId,
      source: req.body.source,
      clientId: req.body.clientId,
      contactName: req.body.contactName,
      contactPhone: req.body.contactPhone,
      startedAt: req.body.startedAt,
      endedAt: req.body.endedAt,
      context: req.body.context,
    });

    return res.status(201).json(ticket);
  }),
);

ticketsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateTicketSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, tenantId } });
    if (!ticket) {
      throw new AppError(404, 'Chamado não encontrado.');
    }

    if (req.body.handledByUserId) {
      const user = await prisma.user.findFirst({ where: { id: req.body.handledByUserId, tenantId } });
      if (!user) {
        throw new AppError(400, 'Usuário responsável inválido.');
      }
    }

    if (req.body.ticketTypeId) {
      const ticketType = await prisma.ticketType.findFirst({ where: { id: req.body.ticketTypeId, tenantId } });
      if (!ticketType) {
        throw new AppError(400, 'Tipo de atendimento inválido.');
      }
    }

    if (req.body.sectorId) {
      const sector = await prisma.sector.findFirst({ where: { id: req.body.sectorId, tenantId } });
      if (!sector) {
        throw new AppError(400, 'Setor inválido.');
      }
    }

    const events = buildTicketEvents(ticket, req.body, req.auth!.userId);

    const [updated] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: req.body.status,
          handledByUserId: req.body.handledByUserId,
          resolutionNotes: req.body.resolutionNotes,
          ticketTypeId: req.body.ticketTypeId,
          sectorId: req.body.sectorId,
          closedAt: req.body.status === 'CLOSED' ? new Date() : req.body.status ? null : undefined,
        },
        include: {
          client: { select: { id: true, name: true } },
          ticketType: { select: { id: true, name: true } },
          sector: { select: { id: true, name: true } },
          handledBy: { select: { id: true, name: true } },
        },
      }),
      ...(events.length > 0 ? [prisma.ticketEvent.createMany({ data: events })] : []),
    ]);

    return res.json(updated);
  }),
);

// Linha do tempo de auditoria — mostrada em TicketDetail abaixo de "o que
// foi feito". Somente leitura, nunca editável/apagável pelo usuário.
ticketsRouter.get(
  '/:id/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, tenantId } });
    if (!ticket) {
      throw new AppError(404, 'Chamado não encontrado.');
    }

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: ticket.id, tenantId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(events);
  }),
);

// Botão "Gerar com IA" no detalhe do chamado — ao contrário da criação
// automática, aqui um erro de IA (ex: chave inválida) deve chegar claro pro
// usuário, então não é engolido.
ticketsRouter.post(
  '/:id/generate-insight',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, tenantId } });
    if (!ticket) {
      throw new AppError(404, 'Chamado não encontrado.');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiProvider: true, aiApiKeyEncrypted: true },
    });

    if (!tenant?.aiProvider || !tenant.aiApiKeyEncrypted) {
      throw new AppError(
        400,
        'Nenhuma chave de API de IA configurada. Peça ao administrador da conta para configurar em Admin → Integração IA.',
      );
    }

    const ticketTypes = await prisma.ticketType.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const insight = await generateTicketInsight(tenant, {
      subject: ticket.subject,
      context: ticket.description || ticket.subject,
      ticketTypeNames: ticketTypes.map((t) => t.name),
    });

    const matchedType = insight.ticketTypeName
      ? ticketTypes.find((t) => t.name.toLowerCase() === insight.ticketTypeName!.toLowerCase())
      : undefined;

    // matchedType?.id fica undefined quando a IA não bate com nenhum tipo
    // cadastrado — mesmo contrato do update abaixo, que nesse caso não mexe
    // no ticketTypeId (undefined = "não veio", não confundir com null).
    const events = buildTicketEvents(
      ticket,
      { resolutionNotes: insight.resolutionNotes, ticketTypeId: matchedType?.id },
      req.auth!.userId,
    );

    const [updated] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { resolutionNotes: insight.resolutionNotes, ticketTypeId: matchedType?.id },
        include: {
          client: { select: { id: true, name: true } },
          ticketType: { select: { id: true, name: true } },
          sector: { select: { id: true, name: true } },
          handledBy: { select: { id: true, name: true } },
        },
      }),
      ...(events.length > 0 ? [prisma.ticketEvent.createMany({ data: events })] : []),
    ]);

    return res.json(updated);
  }),
);

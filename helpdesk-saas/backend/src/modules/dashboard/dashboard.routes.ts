import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';

export const dashboardRouter = Router();

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function parseDateParam(value: unknown, fallback: Date): Date {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function parseStringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Recorta o intervalo [start,end] pra dentro de [from,to] — um log pode ter
// começado antes do período filtrado ou ainda estar aberto (endedAt null).
function overlapMs(start: Date, end: Date | null, from: Date, to: Date): number {
  const overlapStart = Math.max(start.getTime(), from.getTime());
  const overlapEnd = Math.min((end ?? new Date()).getTime(), to.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

dashboardRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const [totalTickets, openTickets, closedTickets, typeGroups, clientGroups, ticketDates] = await Promise.all([
      prisma.ticket.count({ where: { tenantId } }),
      prisma.ticket.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.ticket.count({ where: { tenantId, status: 'CLOSED' } }),
      prisma.ticket.groupBy({
        by: ['ticketTypeId'],
        where: { tenantId },
        _count: { _all: true },
        orderBy: { _count: { ticketTypeId: 'desc' } },
      }),
      prisma.ticket.groupBy({
        by: ['clientId'],
        where: { tenantId, clientId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { clientId: 'desc' } },
        take: 8,
      }),
      prisma.ticket.findMany({ where: { tenantId }, select: { createdAt: true } }),
    ]);

    const clients = await prisma.client.findMany({
      where: { tenantId, id: { in: clientGroups.map((g) => g.clientId).filter((id): id is string => !!id) } },
      select: { id: true, name: true },
    });
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    const ticketTypes = await prisma.ticketType.findMany({
      where: { tenantId, id: { in: typeGroups.map((g) => g.ticketTypeId).filter((id): id is string => !!id) } },
      select: { id: true, name: true },
    });
    const ticketTypeNameById = new Map(ticketTypes.map((t) => [t.id, t.name]));

    // Agregado em JS em vez de SQL raw — o volume de dados do protótipo não
    // justifica a complexidade, e fica portável se o banco mudar depois.
    const weekdayCounts = new Array(7).fill(0);
    for (const { createdAt } of ticketDates) {
      weekdayCounts[createdAt.getDay()] += 1;
    }

    return res.json({
      totalTickets,
      openTickets,
      closedTickets,
      topClients: clientGroups
        .filter((g): g is typeof g & { clientId: string } => g.clientId !== null)
        .map((g) => ({
          clientId: g.clientId,
          name: clientNameById.get(g.clientId) ?? 'Desconhecido',
          count: g._count._all,
        })),
      byTicketType: typeGroups.map((g) => ({
        ticketTypeId: g.ticketTypeId,
        name: g.ticketTypeId ? (ticketTypeNameById.get(g.ticketTypeId) ?? 'Desconhecido') : 'Sem tipo',
        count: g._count._all,
      })),
      byWeekday: weekdayCounts.map((count, i) => ({ weekday: WEEKDAY_LABELS[i], count })),
    });
  }),
);

// Relatório com filtro de período/usuário/cliente — separado do /summary
// (que continua fixo, "últimos 60 dias") pra não arriscar quebrar o que já
// funciona. "Atendimentos" aqui é Ticket (já real); Conversas (chat) ainda
// não tem back-end, então não entram nesse relatório.
dashboardRouter.get(
  '/reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const from = parseDateParam(req.query.from, defaultFrom);
    const to = parseDateParam(req.query.to, now);
    const userId = parseStringParam(req.query.userId);
    const clientId = parseStringParam(req.query.clientId);

    const ticketWhere = {
      tenantId,
      createdAt: { gte: from, lte: to },
      ...(userId ? { handledByUserId: userId } : {}),
      ...(clientId ? { clientId } : {}),
    };

    const callWhere = {
      tenantId,
      startedAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
      ...(clientId ? { clientId } : {}),
    };

    const [ticketTotal, ticketByUserGroups, ticketByClientGroups, calls, statusLogs, users] = await Promise.all([
      prisma.ticket.count({ where: ticketWhere }),
      prisma.ticket.groupBy({ by: ['handledByUserId'], where: ticketWhere, _count: { _all: true } }),
      prisma.ticket.groupBy({
        by: ['clientId'],
        where: ticketWhere,
        _count: { _all: true },
        orderBy: { _count: { clientId: 'desc' } },
        take: 10,
      }),
      prisma.call.findMany({ where: callWhere, select: { userId: true, clientId: true, startedAt: true, endedAt: true } }),
      prisma.agentStatusLog.findMany({
        where: {
          tenantId,
          ...(userId ? { userId } : {}),
          startedAt: { lte: to },
          OR: [{ endedAt: null }, { endedAt: { gte: from } }],
        },
        select: { userId: true, status: true, startedAt: true, endedAt: true },
      }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);

    const userNameById = new Map(users.map((u) => [u.id, u.name]));

    const clientIds = Array.from(
      new Set([
        ...ticketByClientGroups.map((g) => g.clientId).filter((id): id is string => !!id),
        ...calls.map((c) => c.clientId).filter((id): id is string => !!id),
      ]),
    );
    const clients = await prisma.client.findMany({
      where: { tenantId, id: { in: clientIds } },
      select: { id: true, name: true },
    });
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    const ticketsByUser = ticketByUserGroups
      .map((g) => ({
        userId: g.handledByUserId,
        userName: g.handledByUserId ? (userNameById.get(g.handledByUserId) ?? 'Desconhecido') : 'Não atribuído',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const ticketsByClient = ticketByClientGroups.map((g) => ({
      clientId: g.clientId,
      clientName: g.clientId ? (clientNameById.get(g.clientId) ?? 'Desconhecido') : 'Sem cliente vinculado',
      count: g._count._all,
    }));

    // Minutos de chamada agregados em JS — mesmo motivo do byWeekday acima.
    const callStatsByUser = new Map<string, { count: number; ms: number }>();
    const callStatsByClient = new Map<string, { count: number; ms: number }>();
    let totalCallMs = 0;

    for (const call of calls) {
      const durationMs = (call.endedAt ?? now).getTime() - call.startedAt.getTime();
      totalCallMs += durationMs;

      const userEntry = callStatsByUser.get(call.userId) ?? { count: 0, ms: 0 };
      userEntry.count += 1;
      userEntry.ms += durationMs;
      callStatsByUser.set(call.userId, userEntry);

      if (call.clientId) {
        const clientEntry = callStatsByClient.get(call.clientId) ?? { count: 0, ms: 0 };
        clientEntry.count += 1;
        clientEntry.ms += durationMs;
        callStatsByClient.set(call.clientId, clientEntry);
      }
    }

    const toMinutes = (ms: number) => Math.round(ms / 60_000);

    const statusMsByUser = new Map<string, { AVAILABLE: number; PAUSED: number; OFFLINE: number }>();
    for (const log of statusLogs) {
      const ms = overlapMs(log.startedAt, log.endedAt, from, to);
      const entry = statusMsByUser.get(log.userId) ?? { AVAILABLE: 0, PAUSED: 0, OFFLINE: 0 };
      entry[log.status] += ms;
      statusMsByUser.set(log.userId, entry);
    }

    return res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      tickets: {
        total: ticketTotal,
        byUser: ticketsByUser,
        byClient: ticketsByClient,
      },
      calls: {
        total: calls.length,
        totalMinutes: toMinutes(totalCallMs),
        byUser: Array.from(callStatsByUser.entries())
          .map(([uid, v]) => ({
            userId: uid,
            userName: userNameById.get(uid) ?? 'Desconhecido',
            count: v.count,
            minutes: toMinutes(v.ms),
          }))
          .sort((a, b) => b.minutes - a.minutes),
        byClient: Array.from(callStatsByClient.entries())
          .map(([cid, v]) => ({
            clientId: cid,
            clientName: clientNameById.get(cid) ?? 'Desconhecido',
            count: v.count,
            minutes: toMinutes(v.ms),
          }))
          .sort((a, b) => b.minutes - a.minutes),
      },
      agentStatus: {
        byUser: Array.from(statusMsByUser.entries()).map(([uid, v]) => ({
          userId: uid,
          userName: userNameById.get(uid) ?? 'Desconhecido',
          availableMinutes: toMinutes(v.AVAILABLE),
          pausedMinutes: toMinutes(v.PAUSED),
          offlineMinutes: toMinutes(v.OFFLINE),
        })),
      },
    });
  }),
);

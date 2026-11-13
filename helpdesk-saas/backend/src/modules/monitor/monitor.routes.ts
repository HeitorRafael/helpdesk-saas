import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';

export const monitorRouter = Router();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Pensado pra ficar aberto num telão do setor — atualizado por polling no
// front (sem WebSocket ainda). activeChats vem do ChatSession (registro leve
// criado ao "pegar" um atendimento em Conversas, sem conteúdo de mensagem).
monitorRouter.get(
  '/live',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const today = startOfToday();
    const week = startOfWeek();
    const month = startOfMonth();

    const [
      activeCallsRaw,
      activeChatsRaw,
      openStatusLogs,
      users,
      callsToday,
      callsWeek,
      callsMonth,
      ticketsToday,
      ticketsWeek,
      ticketsMonth,
    ] = await Promise.all([
      prisma.call.findMany({ where: { tenantId, endedAt: null }, orderBy: { startedAt: 'asc' } }),
      prisma.chatSession.findMany({ where: { tenantId, endedAt: null }, orderBy: { startedAt: 'asc' } }),
      prisma.agentStatusLog.findMany({ where: { tenantId, endedAt: null } }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.call.count({ where: { tenantId, startedAt: { gte: today } } }),
      prisma.call.count({ where: { tenantId, startedAt: { gte: week } } }),
      prisma.call.count({ where: { tenantId, startedAt: { gte: month } } }),
      prisma.ticket.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.ticket.count({ where: { tenantId, createdAt: { gte: week } } }),
      prisma.ticket.count({ where: { tenantId, createdAt: { gte: month } } }),
    ]);

    const userNameById = new Map(users.map((u) => [u.id, u.name]));

    return res.json({
      activeCalls: activeCallsRaw.map((call) => ({
        id: call.id,
        userId: call.userId,
        userName: userNameById.get(call.userId) ?? 'Desconhecido',
        contactName: call.contactName,
        phone: call.phone,
        startedAt: call.startedAt,
      })),
      activeChats: activeChatsRaw.map((chat) => ({
        id: chat.id,
        userId: chat.userId,
        userName: userNameById.get(chat.userId) ?? 'Desconhecido',
        contactName: chat.contactName,
        companyName: chat.companyName,
        startedAt: chat.startedAt,
      })),
      agentStatus: users.map((user) => {
        const log = openStatusLogs.find((l) => l.userId === user.id);
        return { userId: user.id, userName: user.name, status: log?.status ?? 'OFFLINE' };
      }),
      counters: {
        calls: { today: callsToday, week: callsWeek, month: callsMonth },
        tickets: { today: ticketsToday, week: ticketsWeek, month: ticketsMonth },
      },
    });
  }),
);

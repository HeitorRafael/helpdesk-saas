import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './utils/logger';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { tenantsRouter } from './modules/tenants/tenants.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { agentStatusRouter } from './modules/agent-status/agent-status.routes';
import { callsRouter } from './modules/calls/calls.routes';
import { monitorRouter } from './modules/monitor/monitor.routes';
import { ticketsRouter } from './modules/tickets/tickets.routes';
import { ticketTypesRouter } from './modules/ticket-types/ticket-types.routes';
import { sectorsRouter } from './modules/sectors/sectors.routes';
import { queuesRouter } from './modules/queues/queues.routes';
import { chatSessionsRouter } from './modules/chat-sessions/chat-sessions.routes';
import { internalChatRouter } from './modules/internal-chat/internal-chat.routes';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes';
import { billingRouter } from './modules/billing/billing.routes';

export const app = express();

// --- Segurança de cabeçalhos HTTP ---
app.use(helmet());

// --- CORS restrito por allowlist, com credenciais (cookies) habilitadas ---
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
// Só o callback da Apple usa isso (response_mode=form_post exigido pela
// Apple ao pedir escopo "name"/"email") — inofensivo pro resto das rotas.
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));
app.use(globalRateLimiter);

// --- Rotas ---
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agent-status', agentStatusRouter);
app.use('/api/calls', callsRouter);
app.use('/api/monitor', monitorRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/ticket-types', ticketTypesRouter);
app.use('/api/sectors', sectorsRouter);
app.use('/api/queues', queuesRouter);
app.use('/api/chat-sessions', chatSessionsRouter);
app.use('/api/internal-chat', internalChatRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/billing', billingRouter);

// --- 404 ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// --- Handler central de erros (sempre por último) ---
app.use(errorHandler);

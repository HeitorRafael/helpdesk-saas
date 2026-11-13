import { app } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { resumeAllSessions } from './modules/whatsapp/whatsapp.service';

app.listen(env.PORT, () => {
  logger.info(`🚀 Backend rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Reconecta sozinho qualquer tenant que já estava com WhatsApp conectado
// antes do restart (credenciais já salvas em disco, sem pedir QR de novo).
resumeAllSessions().catch((err) => logger.error({ err }, 'Falha ao retomar sessões do WhatsApp'));

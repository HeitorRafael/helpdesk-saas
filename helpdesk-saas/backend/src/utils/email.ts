import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

// Mesmo padrão do Google/Apple em env.ts — SMTP é opcional. Sem ele
// configurado, o e-mail não sai, mas o resto do fluxo (ex: "esqueci minha
// senha") continua respondendo normalmente, só loga um aviso claro.
const transporter =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    logger.warn({ event: 'email.not_configured', to, subject }, 'SMTP não configurado — e-mail não enviado.');
    return;
  }

  try {
    await transporter.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to, subject, html });
    logger.info({ event: 'email.sent', to, subject }, 'E-mail enviado.');
  } catch (err) {
    logger.error({ event: 'email.send_failed', err, to, subject }, 'Falha ao enviar e-mail.');
  }
}

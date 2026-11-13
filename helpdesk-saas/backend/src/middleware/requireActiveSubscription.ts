import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';

// Bloqueia o uso do app quando a assinatura ficou inadimplente/cancelada.
// Tenant SEM registro de assinatura (ex: contas criadas antes desse recurso
// existir) é tratado como legado/liberado — nunca bloqueia quem nunca passou
// pelo checkout, só quem passou e ficou pra trás no pagamento.
export const requireActiveSubscription = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: req.auth.tenantId } });
  if (!subscription) {
    return next(); // legado, sem cobrança configurada — libera
  }

  if (subscription.status === 'PAST_DUE' || subscription.status === 'CANCELED') {
    return res.status(402).json({ error: 'Assinatura com pagamento pendente. Regularize em Admin → Assinatura.' });
  }

  return next();
});

import { Router } from 'express';
import { PlanTier } from '@prisma/client';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { safeCompare } from '../../utils/security';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { checkoutSchema } from './billing.validators';
import { createAsaasCustomer, createAsaasSubscriptionWithCreditCard } from './asaas.service';

export const billingRouter = Router();

// Preço-base mensal por agente — ver plano de monetização (raio-x do
// sistema). Ajustar aqui é a única mudança necessária pra reprecificar.
const PLAN_PRICE_PER_SEAT: Record<PlanTier, number> = { STARTER: 97, PROFISSIONAL: 179 };
const VOICE_ADDON_PRICE_PER_SEAT = 69;
const MIN_SEATS: Record<PlanTier, number> = { STARTER: 2, PROFISSIONAL: 1 };
const TRIAL_DAYS = 30;

function planValue(planTier: PlanTier, seatCount: number, voiceAddonEnabled: boolean): number {
  const base = PLAN_PRICE_PER_SEAT[planTier] * seatCount;
  const addon = voiceAddonEnabled ? VOICE_ADDON_PRICE_PER_SEAT * seatCount : 0;
  return Math.round((base + addon) * 100) / 100;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Chamado logo depois do cadastro (register-company), autenticado com o
// accessToken que a própria resposta do cadastro já devolve — cria o
// cliente e a assinatura na Asaas, com o cartão obrigatório de trial.
billingRouter.post(
  '/checkout',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    if (existing) {
      throw new AppError(409, 'Este tenant já tem uma assinatura.');
    }

    if (req.body.seatCount < MIN_SEATS[req.body.planTier as PlanTier]) {
      throw new AppError(400, `O plano ${req.body.planTier} exige no mínimo ${MIN_SEATS[req.body.planTier as PlanTier]} agentes.`);
    }

    const [tenant, user] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } }),
    ]);

    const customer = await createAsaasCustomer({
      name: tenant.name,
      cpfCnpj: req.body.cpfCnpj,
      email: user.email,
    });

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const value = planValue(req.body.planTier, req.body.seatCount, req.body.voiceAddonEnabled);

    const subscription = await createAsaasSubscriptionWithCreditCard({
      customerId: customer.id,
      value,
      nextDueDate: formatDateOnly(trialEndsAt),
      description: `Helpdesk Intelligence — ${req.body.planTier}${req.body.voiceAddonEnabled ? ' + Ligação' : ''}`,
      creditCard: req.body.creditCard,
      creditCardHolderInfo: {
        name: req.body.creditCard.holderName,
        email: user.email,
        cpfCnpj: req.body.cpfCnpj,
        postalCode: req.body.postalCode,
        addressNumber: req.body.addressNumber,
        phone: req.body.phone,
      },
      remoteIp: req.ip ?? '0.0.0.0',
    });

    const created = await prisma.subscription.create({
      data: {
        tenantId,
        planTier: req.body.planTier,
        voiceAddonEnabled: req.body.voiceAddonEnabled,
        status: 'TRIALING',
        trialEndsAt,
        asaasCustomerId: customer.id,
        asaasSubscriptionId: subscription.id,
      },
    });

    logger.info({ event: 'billing.subscription_created', tenantId, planTier: req.body.planTier }, 'Assinatura criada (trial).');

    return res.status(201).json(created);
  }),
);

billingRouter.get(
  '/subscription',
  requireAuth,
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: req.auth!.tenantId } });
    return res.json(subscription);
  }),
);

// Sem requireAuth — quem chama é a Asaas, não um usuário logado. A
// autenticidade vem do header asaas-access-token (comparado em tempo
// constante), não de um JWT.
billingRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const receivedToken = req.get('asaas-access-token') ?? '';
    if (!env.ASAAS_WEBHOOK_TOKEN || !safeCompare(receivedToken, env.ASAAS_WEBHOOK_TOKEN)) {
      logger.warn({ event: 'billing.webhook_rejected' }, 'Webhook da Asaas rejeitado — token inválido.');
      return res.status(401).json({ error: 'Token inválido.' });
    }

    const { event, payment } = req.body as { event?: string; payment?: { subscription?: string; nextDueDate?: string } };
    const asaasSubscriptionId = payment?.subscription;

    if (!asaasSubscriptionId) {
      return res.status(200).json({ received: true }); // evento sem assinatura associada — ignora
    }

    const subscription = await prisma.subscription.findFirst({ where: { asaasSubscriptionId } });
    if (!subscription) {
      return res.status(200).json({ received: true }); // assinatura de outro ambiente/sandbox — ignora
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: payment?.nextDueDate ? new Date(payment.nextDueDate) : undefined,
        },
      });
      logger.info({ event: 'billing.payment_confirmed', tenantId: subscription.tenantId }, 'Pagamento confirmado.');
    } else if (event === 'PAYMENT_OVERDUE') {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } });
      logger.warn({ event: 'billing.payment_overdue', tenantId: subscription.tenantId }, 'Pagamento em atraso.');
    }

    return res.status(200).json({ received: true });
  }),
);

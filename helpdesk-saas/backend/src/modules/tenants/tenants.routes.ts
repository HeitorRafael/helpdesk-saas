import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { decryptSecret, encryptSecret, maskApiKey } from '../../utils/encryption';
import { updateAiSettingsSchema } from './tenants.validators';

export const tenantsRouter = Router();

// Esqueleto proposital: aqui vai entrar o fluxo de onboarding de uma nova
// empresa-cliente (criar Tenant + primeiro usuário ADMIN). Deixado vazio
// de propósito para vocês decidirem juntos as regras de negócio (ex:
// é autoatendimento/self-signup, ou só você cadastra manualmente no início?).

// Só ADMIN vê e mexe na chave de IA — a chave em si nunca sai do banco em
// texto puro, nem nessa própria rota (só uma versão mascarada).
tenantsRouter.get(
  '/ai-settings',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.auth!.tenantId },
      select: { aiProvider: true, aiApiKeyEncrypted: true },
    });

    const maskedKey = tenant?.aiApiKeyEncrypted ? maskApiKey(decryptSecret(tenant.aiApiKeyEncrypted)) : null;

    return res.json({
      provider: tenant?.aiProvider ?? null,
      hasApiKey: !!tenant?.aiApiKeyEncrypted,
      maskedKey,
    });
  }),
);

tenantsRouter.put(
  '/ai-settings',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(updateAiSettingsSchema),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.update({
      where: { id: req.auth!.tenantId },
      data: {
        aiProvider: req.body.provider,
        aiApiKeyEncrypted: encryptSecret(req.body.apiKey),
      },
      select: { aiProvider: true },
    });

    return res.json({ provider: tenant.aiProvider, hasApiKey: true, maskedKey: maskApiKey(req.body.apiKey) });
  }),
);

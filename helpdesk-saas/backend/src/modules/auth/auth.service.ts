import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import {
  comparePassword,
  generateRefreshTokenValue,
  hashPassword,
  hashToken,
  isPasswordStrongEnough,
  refreshTokenExpiryDate,
  signAccessToken,
  signPendingSignupToken,
  verifyPendingSignupToken,
} from '../../utils/security';
import { slugify } from '../../utils/slugify';
import { sendEmail } from '../../utils/email';
import {
  CompleteOAuthSignupInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterCompanyInput,
  ResetPasswordInput,
} from './auth.validators';

const PASSWORD_RESET_EXPIRY_MINUTES = 30;

interface LoginContext {
  ip?: string;
  userAgent?: string;
}

async function recordAudit(
  tenantId: string,
  userId: string | null,
  action: string,
  ip?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: { tenantId, userId, action, ip, metadata: metadata as Prisma.InputJsonValue | undefined },
  });
}

export async function login(input: LoginInput, ctx: LoginContext) {
  // Mensagem genérica de propósito — não revelamos se foi o e-mail ou a
  // senha que estava errada. Isso evita enumeração de contas.
  const genericError = () => new AppError(401, 'Credenciais inválidas.');

  // E-mail é único globalmente (não mais por tenant) — dá pra achar direto
  // o usuário e, a partir dele, o tenant. Não pedimos mais "nome da empresa".
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

  if (!user || user.status !== 'ACTIVE') throw genericError();

  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) throw genericError();

  // Bloqueio progressivo: se a conta estiver travada, nem chega a comparar senha.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit(tenant.id, user.id, 'LOGIN_BLOCKED_ACCOUNT_LOCKED', ctx.ip);
    throw new AppError(423, 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.');
  }

  const passwordMatches = await comparePassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    // Increment atômico — ler failedLoginAttempts e escrever attempts+1 em
    // dois passos deixaria requisições paralelas lerem o mesmo valor antigo
    // e "perderem" incrementos, dando algumas tentativas a mais que o
    // threshold configurado antes de travar a conta.
    const afterIncrement = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    const shouldLock = afterIncrement.failedLoginAttempts >= env.ACCOUNT_LOCK_THRESHOLD;
    if (shouldLock) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60 * 1000),
        },
      });
    }

    await recordAudit(tenant.id, user.id, 'LOGIN_FAILED', ctx.ip, { attempts: afterIncrement.failedLoginAttempts });
    throw genericError();
  }

  // Login OK: zera contador de falhas, registra último acesso
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: tenant.id,
    role: user.role,
  });

  const refreshTokenValue = generateRefreshTokenValue();

  await prisma.refreshToken.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      tokenHash: hashToken(refreshTokenValue),
      expiresAt: refreshTokenExpiryDate(),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    },
  });

  await recordAudit(tenant.id, user.id, 'LOGIN_SUCCESS', ctx.ip);

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  };
}

// Compartilhado por registerCompany e completeOAuthSignup — cria a empresa +
// o primeiro usuário (ADMIN) numa transação e já devolve uma sessão pronta,
// igual ao retorno de login().
async function createTenantAndSession(
  params: { companyName: string; name: string; email: string; passwordHash: string },
  ctx: LoginContext,
) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) {
    // Diferente do login (erro genérico de propósito), cadastro revela
    // e-mail duplicado — é convenção padrão de qualquer tela de signup.
    throw new AppError(409, 'Já existe uma conta com esse e-mail. Faça login em vez de cadastrar.');
  }

  const baseSlug = slugify(params.companyName);
  let slug = baseSlug;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: params.companyName, slug } });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: params.name,
        email: params.email,
        passwordHash: params.passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    return { tenant, user };
  });

  const accessToken = signAccessToken({ sub: user.id, tenantId: tenant.id, role: user.role });
  const refreshTokenValue = generateRefreshTokenValue();

  await prisma.refreshToken.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      tokenHash: hashToken(refreshTokenValue),
      expiresAt: refreshTokenExpiryDate(),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    },
  });

  await recordAudit(tenant.id, user.id, 'TENANT_REGISTERED', ctx.ip, { companyName: params.companyName });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  };
}

export async function registerCompany(input: RegisterCompanyInput, ctx: LoginContext) {
  if (!isPasswordStrongEnough(input.password)) {
    throw new AppError(400, 'Senha muito fraca — use ao menos 10 caracteres com letras e números.');
  }

  const passwordHash = await hashPassword(input.password);

  return createTenantAndSession(
    { companyName: input.companyName, name: input.name, email: input.email.toLowerCase(), passwordHash },
    ctx,
  );
}

export async function completeOAuthSignup(input: CompleteOAuthSignupInput, ctx: LoginContext) {
  let payload;
  try {
    payload = verifyPendingSignupToken(input.pendingToken);
  } catch {
    throw new AppError(400, 'Link de cadastro expirado ou inválido. Tente entrar com Google/Apple de novo.');
  }

  if (!isPasswordStrongEnough(input.password)) {
    throw new AppError(400, 'Senha muito fraca — use ao menos 10 caracteres com letras e números.');
  }

  const passwordHash = await hashPassword(input.password);

  return createTenantAndSession(
    { companyName: input.companyName, name: payload.name, email: payload.email.toLowerCase(), passwordHash },
    ctx,
  );
}

// Chamado pelo callback do Google/Apple depois de verificar a identidade —
// decide se o e-mail já tem conta (manda pro login) ou é novo (gera o
// pendingToken pra terminar o cadastro pedindo só o nome da empresa).
export async function resolveOAuthIdentity(
  provider: 'google' | 'apple',
  identity: { email: string; name: string },
): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: identity.email } });
  if (existing) {
    return 'error=email_exists';
  }

  const pendingToken = signPendingSignupToken({ provider, email: identity.email, name: identity.name });
  return `pendingToken=${encodeURIComponent(pendingToken)}`;
}

export async function rotateRefreshToken(rawToken: string, ctx: LoginContext) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revoked || existing.expiresAt < new Date()) {
    // Reuso de token revogado/expirado é sinal de possível roubo — revoga tudo do usuário.
    if (existing) {
      await prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revoked: false },
        data: { revoked: true },
      });
      await recordAudit(existing.tenantId, existing.userId, 'REFRESH_TOKEN_REUSE_DETECTED', ctx.ip);
    }
    throw new AppError(401, 'Sessão inválida. Faça login novamente.');
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'Sessão inválida.');

  const tenant = await prisma.tenant.findUnique({ where: { id: existing.tenantId } });
  if (!tenant) throw new AppError(401, 'Sessão inválida.');

  const newRefreshValue = generateRefreshTokenValue();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revoked: true, replacedBy: hashToken(newRefreshValue) },
    }),
    prisma.refreshToken.create({
      data: {
        tenantId: existing.tenantId,
        userId: existing.userId,
        tokenHash: hashToken(newRefreshValue),
        expiresAt: refreshTokenExpiryDate(),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: existing.tenantId,
    role: user.role,
  });

  return {
    accessToken,
    refreshToken: newRefreshValue,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  };
}

export async function logout(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
}

// Sempre "sucesso" pro chamador, exista ou não a conta — evita que alguém
// descubra quais e-mails têm cadastro só testando esse formulário.
export async function requestPasswordReset(input: ForgotPasswordInput, ctx: LoginContext): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || user.status !== 'ACTIVE') return;

  const rawToken = generateRefreshTokenValue();
  await prisma.authToken.create({
    data: {
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
    },
  });

  const resetUrl = `${env.CORS_ORIGIN}/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
  await sendEmail(
    user.email,
    'Redefinir sua senha — Helpdesk Intelligence',
    `<p>Recebemos um pedido pra redefinir sua senha.</p>
     <p><a href="${resetUrl}">Clique aqui pra criar uma nova senha</a> — o link expira em ${PASSWORD_RESET_EXPIRY_MINUTES} minutos.</p>
     <p>Se você não pediu isso, pode ignorar este e-mail.</p>`,
  );

  await recordAudit(user.tenantId, user.id, 'PASSWORD_RESET_REQUESTED', ctx.ip);
}

export async function resetPassword(input: ResetPasswordInput, ctx: LoginContext): Promise<void> {
  const tokenHash = hashToken(input.token);
  const authToken = await prisma.authToken.findUnique({ where: { tokenHash } });

  if (!authToken || authToken.purpose !== 'PASSWORD_RESET' || authToken.usedAt || authToken.expiresAt < new Date()) {
    throw new AppError(400, 'Link de redefinição inválido ou expirado. Peça um novo.');
  }

  if (!isPasswordStrongEnough(input.password)) {
    throw new AppError(400, 'Senha muito fraca — use ao menos 10 caracteres com letras e números.');
  }

  const user = await prisma.user.findUnique({ where: { id: authToken.userId } });
  if (!user) {
    throw new AppError(400, 'Link de redefinição inválido ou expirado. Peça um novo.');
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.authToken.update({ where: { id: authToken.id }, data: { usedAt: new Date() } }),
    // Redefinir a senha revoga todas as sessões existentes — se foi um
    // invasor que pediu o reset, isso derruba o acesso dele também.
    prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);

  await recordAudit(user.tenantId, user.id, 'PASSWORD_RESET_COMPLETED', ctx.ip);
}

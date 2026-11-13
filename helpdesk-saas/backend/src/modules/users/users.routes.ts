import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import { hashPassword, isPasswordStrongEnough } from '../../utils/security';
import { createUserSchema, updateUserRoleSchema } from './users.validators';

export const usersRouter = Router();

// Rota protegida de exemplo — prova que o pipeline auth -> tenant scoping funciona.
// req.auth.tenantId vem do JWT, nunca de input do cliente.
usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.auth!.userId, tenantId: req.auth!.tenantId },
      select: { id: true, name: true, email: true, role: true, tenantId: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.json(user);
  }),
);

// Lista a equipe do tenant — usada pro seletor de "transferir para" e pros
// filtros de usuário nos relatórios.
usersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.auth!.tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    return res.json(users);
  }),
);

// Lista completa (todos os status, com e-mail/data) — só pro admin gerenciar
// a equipe. Diferente de GET / acima, que fica enxuta e só-ativos de propósito
// pra seletores de transferência/atribuição espalhados pelo app.
usersRouter.get(
  '/all',
  requireAuth,
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.auth!.tenantId },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return res.json(users);
  }),
);

// Só o admin cria login pra alguém entrar no sistema — sem fluxo de
// autocadastro nem convite por e-mail nesta fase, o admin já define a senha
// inicial diretamente (mesmo padrão dos usuários semeados no seed).
usersRouter.post(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    if (!isPasswordStrongEnough(req.body.password)) {
      throw new AppError(400, 'Senha muito fraca — use ao menos 10 caracteres com letras e números.');
    }

    // E-mail é único GLOBALMENTE (não só no tenant) desde que o login passou
    // a ser só e-mail/senha — checar só dentro do tenant deixaria o create
    // seguinte estourar um erro de constraint não tratado (500) se o e-mail
    // já existir em outra empresa. Também normaliza pra minúsculo, senão um
    // e-mail com maiúscula aqui nunca bateria com o login (que sempre faz
    // .toLowerCase()) — a conta ficaria criada mas impossível de acessar.
    const email = req.body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'Já existe uma conta com esse e-mail.');
    }

    const passwordHash = await hashPassword(req.body.password);

    const user = await prisma.user.create({
      data: {
        tenantId,
        name: req.body.name,
        email,
        passwordHash,
        role: req.body.role,
        status: 'ACTIVE',
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });

    return res.status(201).json(user);
  }),
);

// Promove/rebaixa o papel de alguém — é assim que o admin dá poderes de
// admin pra outra pessoa. Trava: não deixa remover o último ADMIN ativo do
// tenant, senão ninguém mais conseguiria administrar a conta.
usersRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  validateBody(updateUserRoleSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const target = await prisma.user.findFirst({ where: { id: req.params.id, tenantId } });
    if (!target) {
      throw new AppError(404, 'Usuário não encontrado.');
    }

    if (target.role === 'ADMIN' && req.body.role !== 'ADMIN') {
      const otherAdmins = await prisma.user.count({
        where: { tenantId, role: 'ADMIN', status: 'ACTIVE', id: { not: target.id } },
      });
      if (otherAdmins === 0) {
        throw new AppError(400, 'Não é possível remover o último administrador da conta.');
      }
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role: req.body.role },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });

    return res.json(updated);
  }),
);

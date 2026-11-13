import { Request, Response } from 'express';
import { env, isProduction } from '../../config/env';
import * as authService from './auth.service';

const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieOptions() {
  return {
    httpOnly: true, // inacessível via JS -> mitiga XSS
    secure: isProduction, // exige HTTPS em produção
    sameSite: 'strict' as const, // mitiga CSRF
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth', // só é enviado para rotas de auth
  };
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

  return res.status(200).json({
    accessToken: result.accessToken,
    user: result.user,
    tenant: result.tenant,
  });
}

export async function registerCompanyHandler(req: Request, res: Response) {
  const result = await authService.registerCompany(req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

  return res.status(201).json({
    accessToken: result.accessToken,
    user: result.user,
    tenant: result.tenant,
  });
}

export async function completeOAuthSignupHandler(req: Request, res: Response) {
  const result = await authService.completeOAuthSignup(req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

  return res.status(201).json({
    accessToken: result.accessToken,
    user: result.user,
    tenant: result.tenant,
  });
}

export async function refreshHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!rawToken) {
    return res.status(401).json({ error: 'Sessão não encontrada.' });
  }

  const result = await authService.rotateRefreshToken(rawToken, {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

  return res.status(200).json({
    accessToken: result.accessToken,
    user: result.user,
    tenant: result.tenant,
  });
}

export async function logoutHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (rawToken) {
    await authService.logout(rawToken);
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  return res.status(204).send();
}

// Sempre 200 genérico — nunca revela se o e-mail existe ou não.
export async function forgotPasswordHandler(req: Request, res: Response) {
  await authService.requestPasswordReset(req.body, { ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
  return res.status(200).json({ message: 'Se o e-mail existir, enviamos um link de redefinição.' });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  await authService.resetPassword(req.body, { ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
  return res.status(200).json({ message: 'Senha redefinida com sucesso.' });
}

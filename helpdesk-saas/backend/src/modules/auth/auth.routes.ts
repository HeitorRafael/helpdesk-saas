import crypto from 'crypto';
import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerCompanyHandler,
  completeOAuthSignupHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from './auth.controller';
import { validateBody } from '../../middleware/validate';
import {
  completeOAuthSignupSchema,
  forgotPasswordSchema,
  loginSchema,
  registerCompanySchema,
  resetPasswordSchema,
} from './auth.validators';
import { loginRateLimiter, registrationRateLimiter } from '../../middleware/rateLimiter';
import { asyncHandler } from '../../utils/asyncHandler';
import { env, isProduction } from '../../config/env';
import { resolveOAuthIdentity } from './auth.service';
import { buildAppleAuthUrl, buildGoogleAuthUrl, exchangeAppleCode, exchangeGoogleCode } from './oauth.service';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, validateBody(loginSchema), asyncHandler(loginHandler));
authRouter.post('/refresh', asyncHandler(refreshHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));

authRouter.post(
  '/register-company',
  registrationRateLimiter,
  validateBody(registerCompanySchema),
  asyncHandler(registerCompanyHandler),
);
authRouter.post(
  '/oauth/complete-signup',
  registrationRateLimiter,
  validateBody(completeOAuthSignupSchema),
  asyncHandler(completeOAuthSignupHandler),
);

// Mesmo rate limiter estrito da rota de cadastro — sem isso, alguém poderia
// usar "esqueci minha senha" pra descobrir e-mails cadastrados por tentativa
// e erro, ou pra floodar a caixa de entrada de terceiros.
authRouter.post(
  '/forgot-password',
  registrationRateLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(forgotPasswordHandler),
);
authRouter.post(
  '/reset-password',
  registrationRateLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(resetPasswordHandler),
);

// ---------- Login social (só na tela "Criar conta") ----------
// Fluxo sem estado no servidor: o "state" do OAuth vive num cookie httpOnly
// de 10 min; o callback verifica a identidade e devolve pro front um
// pendingToken assinado (ver security.ts) — nunca cria sessão sozinho, só
// sinaliza "essa identidade foi verificada, falta o nome da empresa".

const OAUTH_STATE_COOKIE = 'oauth_state';

function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    // 'lax', não 'strict': esse cookie precisa sobreviver ao redirect de
    // volta do Google/Apple, que é uma navegação cross-site de topo.
    sameSite: 'lax' as const,
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/oauth',
  };
}

function loginRedirect(query: string): string {
  return `${env.CORS_ORIGIN}/login?${query}`;
}

authRouter.get('/oauth/google/start', registrationRateLimiter, (_req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const url = buildGoogleAuthUrl(state);
    res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    return res.redirect(url);
  } catch {
    return res.redirect(loginRedirect('error=oauth_not_configured'));
  }
});

authRouter.get(
  '/oauth/google/callback',
  registrationRateLimiter,
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/oauth' });

    if (typeof code !== 'string' || typeof state !== 'string' || !cookieState || state !== cookieState) {
      return res.redirect(loginRedirect('error=oauth_failed'));
    }

    try {
      const identity = await exchangeGoogleCode(code);
      const query = await resolveOAuthIdentity('google', identity);
      return res.redirect(loginRedirect(query));
    } catch {
      return res.redirect(loginRedirect('error=oauth_failed'));
    }
  }),
);

authRouter.get('/oauth/apple/start', registrationRateLimiter, (_req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const url = buildAppleAuthUrl(state);
    res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    return res.redirect(url);
  } catch {
    return res.redirect(loginRedirect('error=oauth_not_configured'));
  }
});

// Apple usa response_mode=form_post (exigido ao pedir escopo "name"/"email")
// — o corpo chega como application/x-www-form-urlencoded, não JSON.
authRouter.post(
  '/oauth/apple/callback',
  registrationRateLimiter,
  asyncHandler(async (req, res) => {
    const { code, state, user } = req.body ?? {};
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/oauth' });

    if (typeof code !== 'string' || typeof state !== 'string' || !cookieState || state !== cookieState) {
      return res.redirect(loginRedirect('error=oauth_failed'));
    }

    try {
      const identity = await exchangeAppleCode(code, typeof user === 'string' ? user : undefined);
      const query = await resolveOAuthIdentity('apple', identity);
      return res.redirect(loginRedirect(query));
    } catch {
      return res.redirect(loginRedirect('error=oauth_failed'));
    }
  }),
);

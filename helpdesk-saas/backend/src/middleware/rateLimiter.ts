import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Limita tentativas por IP. Isso é a primeira camada de defesa contra
// força bruta — a segunda camada é o bloqueio progressivo por conta,
// que fica em auth.service.ts (baseado em failedLoginAttempts do usuário).
export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em instantes.' },
});

// Cadastro de empresa e login social — mais generoso que o login (criar
// conta é raro, mas não zero), mas sem ficar só no limite geral: sem isso,
// dava pra usar o erro "e-mail já existe" do cadastro pra varrer contas.
export const registrationRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS * 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em instantes.' },
});

// Limite geral, mais permissivo, pra evitar abuso da API como um todo.
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

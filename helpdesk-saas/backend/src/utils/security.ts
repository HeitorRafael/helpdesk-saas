import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

const SALT_ROUNDS = 12;

// ---------- Senhas ----------

export function isPasswordStrongEnough(password: string): boolean {
  // Validação no BACKEND, não só no frontend — o frontend pode ser contornado.
  const hasMinLength = password.length >= 10;
  const hasNumber = /\d/.test(password);
  const hasLetter = /[A-Za-z]/.test(password);
  return hasMinLength && hasNumber && hasLetter;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- JWT (access token) ----------

export interface AccessTokenPayload extends JwtPayload {
  sub: string; // userId
  tenantId: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    // @types/jsonwebtoken exige um literal tipo "15m" pro TS inferir — o
    // valor real vem validado por Zod no boot (config/env.ts), então o cast
    // aqui é seguro.
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

  // Exige explicitamente o formato de access token — sem isso, um token de
  // outro propósito assinado com o mesmo secret (ex: signPendingSignupToken
  // abaixo) passaria na verificação de assinatura e chegaria em requireAuth
  // com tenantId undefined. Prisma trata `where: { tenantId: undefined }`
  // como "sem filtro", o que vazaria dado entre tenants — por isso a forma
  // do payload é parte da validação, não só a assinatura.
  if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Token com formato inesperado.');
  }

  return payload as AccessTokenPayload;
}

// ---------- Token de cadastro pendente (OAuth) ----------
// Identidade verificada (Google/Apple) de curta duração, usada só pra levar
// nome+e-mail do callback do provedor até a etapa "qual o nome da empresa?"
// no front — nunca carrega tenantId/role, de propósito (ver verifyAccessToken acima).

export interface PendingSignupPayload extends JwtPayload {
  purpose: 'oauth_pending_signup';
  provider: 'google' | 'apple';
  email: string;
  name: string;
}

export function signPendingSignupToken(data: { provider: 'google' | 'apple'; email: string; name: string }): string {
  const payload: PendingSignupPayload = { purpose: 'oauth_pending_signup', ...data };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

export function verifyPendingSignupToken(token: string): PendingSignupPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

  if (
    payload.purpose !== 'oauth_pending_signup' ||
    typeof payload.email !== 'string' ||
    typeof payload.name !== 'string'
  ) {
    throw new Error('Token de cadastro pendente inválido.');
  }

  return payload as PendingSignupPayload;
}

// ---------- Refresh token ----------
// O valor puro só existe na hora de gerar e mandar pro cliente (cookie httpOnly).
// No banco, guardamos só o SHA-256 dele. Se o banco vazar, o token não é reutilizável.

export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiryDate(): Date {
  const days = env.JWT_REFRESH_EXPIRES_IN_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Comparação em tempo constante para evitar timing attacks ao comparar hashes/tokens
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

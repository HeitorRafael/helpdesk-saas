import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

// Login social só existe pra criar empresa nova (ver auth.routes.ts) — aqui
// só troca "code" do provedor pela identidade verificada (nome + e-mail).
// Sem SDK novo: Google tem um endpoint oficial que já valida o id_token
// (tokeninfo), e a Apple dá pra verificar com crypto nativo do Node.

export interface OAuthIdentity {
  email: string;
  name: string;
}

function backendUrl(): string {
  return env.BACKEND_URL ?? `http://localhost:${env.PORT}`;
}

// ---------- Google ----------

export function isGoogleConfigured(): boolean {
  return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

export function buildGoogleAuthUrl(state: string): string {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(400, 'Login com Google não configurado neste ambiente.');
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${backendUrl()}/api/auth/oauth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<OAuthIdentity> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, 'Login com Google não configurado neste ambiente.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${backendUrl()}/api/auth/oauth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError(400, 'Não foi possível concluir o login com Google.');
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    throw new AppError(400, 'Resposta inesperada do Google.');
  }

  // tokeninfo já valida assinatura/expiração/audience e devolve os claims —
  // evita ter que buscar/gerenciar o JWKS do Google manualmente.
  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`,
  );
  if (!infoRes.ok) {
    throw new AppError(400, 'Não foi possível validar a identidade do Google.');
  }

  const claims = (await infoRes.json()) as {
    email?: string;
    email_verified?: string;
    name?: string;
    aud?: string;
  };

  if (claims.aud !== env.GOOGLE_CLIENT_ID) {
    throw new AppError(400, 'Token do Google não corresponde a este aplicativo.');
  }
  if (!claims.email || claims.email_verified !== 'true') {
    throw new AppError(400, 'E-mail do Google não verificado.');
  }

  return { email: claims.email.toLowerCase(), name: claims.name || claims.email.split('@')[0] };
}

// ---------- Apple ----------

export function isAppleConfigured(): boolean {
  return !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

export function buildAppleAuthUrl(state: string): string {
  if (!isAppleConfigured()) {
    throw new AppError(400, 'Login com Apple não configurado neste ambiente.');
  }

  const params = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID!,
    redirect_uri: `${backendUrl()}/api/auth/oauth/apple/callback`,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'form_post', // exigido pela Apple ao pedir escopo "name"/"email"
    state,
  });

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

// O "client secret" da Apple não é uma string fixa — é um JWT de curta
// duração, assinado com a chave privada (.p8) baixada no Apple Developer.
function generateAppleClientSecret(): string {
  const privateKey = env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 5 * 60, // só precisa valer o suficiente pra troca do code, que é imediata
      aud: 'https://appleid.apple.com',
      sub: env.APPLE_CLIENT_ID,
    },
    privateKey,
    { algorithm: 'ES256', keyid: env.APPLE_KEY_ID! },
  );
}

interface AppleJwk {
  kty: string;
  kid: string;
  n: string;
  e: string;
}

let cachedAppleJwks: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function getAppleJwks(): Promise<AppleJwk[]> {
  // Cacheia por 1h — as chaves da Apple giram raramente, evita bater na rede
  // a cada login.
  if (cachedAppleJwks && Date.now() - cachedAppleJwks.fetchedAt < 60 * 60 * 1000) {
    return cachedAppleJwks.keys;
  }

  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) {
    throw new AppError(502, 'Não foi possível buscar as chaves públicas da Apple.');
  }

  const data = (await res.json()) as { keys: AppleJwk[] };
  cachedAppleJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

async function verifyAppleIdToken(idToken: string): Promise<{ email: string }> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded.payload === 'string' || !decoded.header.kid) {
    throw new AppError(400, 'Token de identidade da Apple inválido.');
  }

  const keys = await getAppleJwks();
  const jwk = keys.find((k) => k.kid === decoded.header.kid);
  if (!jwk) {
    throw new AppError(400, 'Chave pública da Apple não encontrada para esse token.');
  }

  // Monta a chave pública a partir do JWK (nativo do Node desde a v12, sem
  // precisar de biblioteca de JWKS) e exporta como PEM pro jwt.verify.
  const publicKeyPem = crypto
    .createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' })
    .export({ type: 'spki', format: 'pem' }) as string;

  const payload = jwt.verify(idToken, publicKeyPem, {
    algorithms: ['RS256'],
    audience: env.APPLE_CLIENT_ID,
    issuer: 'https://appleid.apple.com',
  }) as { email?: string };

  if (!payload.email) {
    throw new AppError(400, 'E-mail não retornado pela Apple.');
  }

  return { email: payload.email.toLowerCase() };
}

export async function exchangeAppleCode(code: string, userFormField?: string): Promise<OAuthIdentity> {
  if (!isAppleConfigured()) {
    throw new AppError(400, 'Login com Apple não configurado neste ambiente.');
  }

  const clientSecret = generateAppleClientSecret();

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID!,
      client_secret: clientSecret,
      redirect_uri: `${backendUrl()}/api/auth/oauth/apple/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError(400, 'Não foi possível concluir o login com Apple.');
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    throw new AppError(400, 'Resposta inesperada da Apple.');
  }

  const { email } = await verifyAppleIdToken(tokenData.id_token);

  // Apple só manda o nome (no campo "user", como JSON) no POST do callback,
  // e só na primeira autorização — nas próximas, cai pro e-mail como nome.
  let name = email.split('@')[0];
  if (userFormField) {
    try {
      const parsed = JSON.parse(userFormField) as { name?: { firstName?: string; lastName?: string } };
      const full = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(' ');
      if (full) name = full;
    } catch {
      // segue com o fallback (e-mail)
    }
  }

  return { email, name };
}

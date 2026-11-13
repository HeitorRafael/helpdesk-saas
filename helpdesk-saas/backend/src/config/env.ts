import 'dotenv/config';
import { z } from 'zod';

// Falha rápido e alto se alguma variável de ambiente crítica estiver faltando —
// melhor derrubar o boot do servidor do que rodar em produção com JWT_SECRET vazio.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa ter no mínimo 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa ter no mínimo 16 caracteres'),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .length(64, 'FIELD_ENCRYPTION_KEY precisa ter 64 caracteres hex (32 bytes)')
    .regex(/^[0-9a-f]+$/i, 'FIELD_ENCRYPTION_KEY precisa ser hex'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5),
  ACCOUNT_LOCK_THRESHOLD: z.coerce.number().default(5),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().default(15),

  // URL pública do próprio backend, usada para montar os redirect_uri do
  // OAuth. Em dev cai no fallback http://localhost:PORT (ver oauth.service.ts).
  BACKEND_URL: z.string().optional(),

  // Login social (cadastro de empresa) — todas opcionais de propósito: sem
  // elas o botão continua visível, só devolve um erro claro em vez de quebrar
  // o boot do servidor. Preencha quando tiver as credenciais reais.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(), // Services ID
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(), // conteúdo do .p8, com \n literais

  // E-mail transacional (recuperação de senha, verificação de e-mail) —
  // mesmo padrão opcional acima: sem isso configurado, o botão continua
  // visível, só devolve um aviso claro no log em vez de quebrar o boot.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Cobrança recorrente (Asaas) — opcional pelo mesmo motivo: sem chave, o
  // cadastro com plano pago devolve erro claro em vez de derrubar o boot.
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  ASAAS_BASE_URL: z.string().default('https://api-sandbox.asaas.com/v3'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

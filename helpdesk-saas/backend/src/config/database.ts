import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

// Singleton do Prisma Client — evita esgotar conexões do Postgres
// abrindo um client novo a cada hot-reload em desenvolvimento.
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['error', 'warn', 'query'],
  });

if (!isProduction) {
  global.__prisma__ = prisma;
}

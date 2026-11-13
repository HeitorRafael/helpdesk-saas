import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

// Handler central — garante que erro nenhum vaza stack trace ou detalhe
// interno para o cliente em produção.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error({ err }, 'Erro não tratado');

  return res.status(500).json({
    error: 'Erro interno do servidor.',
    ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}

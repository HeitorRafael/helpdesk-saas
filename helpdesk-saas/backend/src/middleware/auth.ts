import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/security';

// Estende o tipo Request do Express com o que extraímos do JWT.
// IMPORTANTE: tenantId e userId SÓ vêm do token assinado, nunca do
// body/query/params da requisição — isso é o que impede um usuário
// de forjar acesso a dados de outro tenant.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string;
        role: string;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso ausente.' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }
}

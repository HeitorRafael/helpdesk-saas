import { NextFunction, Request, Response } from 'express';

// Uso: router.get('/relatorios', requireAuth, requireRole(['ADMIN', 'GERENCIA']), handler)
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
    }

    return next();
  };
}

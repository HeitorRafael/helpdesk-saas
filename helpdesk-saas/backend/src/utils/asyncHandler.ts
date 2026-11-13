import { NextFunction, Request, RequestHandler, Response } from 'express';

// Evita repetir try/catch em todo controller async — qualquer erro
// (incluindo AppError) cai direto no errorHandler central.
export function asyncHandler(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

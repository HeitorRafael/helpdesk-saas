import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

// Nenhum body chega ao controller sem passar por um schema Zod primeiro.
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: result.error.flatten().fieldErrors,
      });
    }

    req.body = result.data;
    return next();
  };
}

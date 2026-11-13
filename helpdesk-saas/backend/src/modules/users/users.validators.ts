import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(['ADMIN', 'GERENCIA', 'SUPORTE', 'FINANCEIRO', 'RH']),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'GERENCIA', 'SUPORTE', 'FINANCEIRO', 'RH']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  cnpj: z.string().min(1).optional(),
  attributes: z.array(z.object({ name: z.string().min(1), value: z.string() })).optional(),
});

export const addClientAttributeSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type AddClientAttributeInput = z.infer<typeof addClientAttributeSchema>;

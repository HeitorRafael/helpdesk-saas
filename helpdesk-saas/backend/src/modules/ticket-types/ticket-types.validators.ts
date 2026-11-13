import { z } from 'zod';

export const createTicketTypeSchema = z.object({
  name: z.string().min(1).max(60),
});

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;

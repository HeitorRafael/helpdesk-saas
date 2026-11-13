import { z } from 'zod';

export const createSectorSchema = z.object({
  name: z.string().min(1).max(60),
});

export type CreateSectorInput = z.infer<typeof createSectorSchema>;

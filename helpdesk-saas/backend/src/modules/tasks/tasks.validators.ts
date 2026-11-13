import { z } from 'zod';

export const updateTaskStatusSchema = z.object({
  status: z.enum(['PENDING', 'DONE']),
});

export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

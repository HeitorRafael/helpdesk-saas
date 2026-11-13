import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().min(1).max(60),
  colorClassName: z.string().optional(),
  memberUserIds: z.array(z.string().uuid()).optional(),
});

export const updateQueueSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    colorClassName: z.string().optional(),
    memberUserIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar.' });

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;

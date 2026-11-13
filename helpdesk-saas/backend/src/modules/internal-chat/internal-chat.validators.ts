import { z } from 'zod';

export const sendTextMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});

export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;

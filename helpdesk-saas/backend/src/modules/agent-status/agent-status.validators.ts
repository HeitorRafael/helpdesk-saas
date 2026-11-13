import { z } from 'zod';

export const setAgentStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'PAUSED', 'OFFLINE']),
});

export type SetAgentStatusInput = z.infer<typeof setAgentStatusSchema>;

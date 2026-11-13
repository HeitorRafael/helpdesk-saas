import { z } from 'zod';

export const startCallSchema = z.object({
  contactName: z.string().min(1),
  phone: z.string().min(1),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  clientId: z.string().min(1).optional(),
});

export const updateCallSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('transfer'), toUserId: z.string().min(1) }),
]);

export type StartCallInput = z.infer<typeof startCallSchema>;
export type UpdateCallInput = z.infer<typeof updateCallSchema>;

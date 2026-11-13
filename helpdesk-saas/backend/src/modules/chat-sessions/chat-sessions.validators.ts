import { z } from 'zod';

export const claimChatSessionSchema = z.object({
  contactName: z.string().min(1),
  companyName: z.string().optional(),
  clientId: z.string().uuid().optional(),
});

export const endChatSessionSchema = z.object({
  action: z.literal('end'),
  // Transcrição da conversa (efêmera) — usada só como contexto pra IA na
  // hora de gerar o resumo do chamado; não é salva em lugar nenhum.
  context: z.string().optional(),
});

export type ClaimChatSessionInput = z.infer<typeof claimChatSessionSchema>;
export type EndChatSessionInput = z.infer<typeof endChatSessionSchema>;

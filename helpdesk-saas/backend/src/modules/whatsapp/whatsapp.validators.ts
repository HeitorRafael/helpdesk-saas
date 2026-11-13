import { z } from 'zod';

export const transferConversationSchema = z.object({
  queueId: z.string().uuid().nullable().optional(),
  claimedByUserId: z.string().uuid().nullable().optional(),
});

export const finishConversationSchema = z.object({
  // Transcrição/contexto opcional pra IA gerar o resumo do chamado — mesmo
  // campo que já existe em chat-sessions.validators.ts.
  context: z.string().optional(),
});

export const sendTextMessageSchema = z.object({
  text: z.string().min(1),
});

import { z } from 'zod';

// apiKey vazia = "desligar a IA" (limpa a configuração); senão precisa de
// um valor plausível.
export const updateAiSettingsSchema = z.object({
  provider: z.enum(['CLAUDE', 'GEMINI', 'GPT']),
  apiKey: z.string().min(1),
});

export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

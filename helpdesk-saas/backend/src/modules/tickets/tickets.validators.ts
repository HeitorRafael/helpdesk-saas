import { z } from 'zod';

export const createTicketFromAttendanceSchema = z.object({
  source: z.enum(['CALL', 'CHAT']),
  clientId: z.string().uuid().optional(),
  contactName: z.string().min(1),
  contactPhone: z.string().optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  // Transcrição/anotações do atendimento — usada só nesta chamada como
  // contexto pra IA, nunca persistida (Conversas não guarda histórico).
  context: z.string().optional(),
});

export const updateTicketSchema = z
  .object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']).optional(),
    handledByUserId: z.string().uuid().nullable().optional(),
    resolutionNotes: z.string().optional(),
    ticketTypeId: z.string().uuid().nullable().optional(),
    sectorId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar.' });

export type CreateTicketFromAttendanceInput = z.infer<typeof createTicketFromAttendanceSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

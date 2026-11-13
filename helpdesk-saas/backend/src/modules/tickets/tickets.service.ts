import { Ticket, TicketSource } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateTicketInsight } from '../ai/ai.service';

interface CreateTicketFromAttendanceInput {
  tenantId: string;
  userId: string;
  source: TicketSource;
  clientId?: string | null;
  contactName: string;
  contactPhone?: string | null;
  startedAt: Date;
  endedAt: Date;
  context?: string;
}

function formatDuration(startedAt: Date, endedAt: Date): string {
  const totalMinutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes}min`;
}

// Chamada tanto pela rota HTTP (finalizar chat) quanto direto do fim de
// ligação (calls.routes.ts) — um chamado é sempre criado ao fim de um
// atendimento; a IA só entra se o tenant tiver chave configurada, e uma
// falha dela nunca deve impedir o chamado de ser criado.
export async function createTicketFromAttendance(input: CreateTicketFromAttendanceInput): Promise<Ticket> {
  const { tenantId, userId, source, clientId, contactName, contactPhone, startedAt, endedAt, context } = input;

  const subjectPrefix = source === 'CALL' ? 'Ligação com' : 'Chat com';
  const kindLabel = source === 'CALL' ? 'uma ligação' : 'uma conversa';
  const subject = `${subjectPrefix} ${contactName}`;
  const description = `Chamado gerado automaticamente ao finalizar ${kindLabel} em ${endedAt.toLocaleString('pt-BR')} (duração ${formatDuration(startedAt, endedAt)}).`;

  const ticket = await prisma.ticket.create({
    data: {
      tenantId,
      clientId: clientId ?? undefined,
      contactName: clientId ? undefined : contactName,
      contactPhone: clientId ? undefined : (contactPhone ?? undefined),
      subject,
      description,
      source,
      handledByUserId: userId,
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiProvider: true, aiApiKeyEncrypted: true },
  });

  if (!tenant?.aiProvider || !tenant.aiApiKeyEncrypted) {
    return ticket;
  }

  try {
    const ticketTypes = await prisma.ticketType.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const insight = await generateTicketInsight(tenant, {
      subject,
      context: context?.trim() || description,
      ticketTypeNames: ticketTypes.map((t) => t.name),
    });

    const matchedType = insight.ticketTypeName
      ? ticketTypes.find((t) => t.name.toLowerCase() === insight.ticketTypeName!.toLowerCase())
      : undefined;

    return await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        resolutionNotes: insight.resolutionNotes,
        ticketTypeId: matchedType?.id,
      },
    });
  } catch (err) {
    // Criação automática nunca falha por causa da IA — só loga e devolve o
    // chamado sem resolutionNotes, pro usuário revisar manualmente depois.
    logger.error({ err, ticketId: ticket.id }, 'Falha ao gerar resumo automático por IA');
    return ticket;
  }
}

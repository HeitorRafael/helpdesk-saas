export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  CLOSED: 'Fechado',
};

export const SECTOR_LABELS: Record<string, string> = {
  ADMIN: 'Administração',
  GERENCIA: 'Gerência',
  SUPORTE: 'Suporte',
  FINANCEIRO: 'Financeiro',
  RH: 'RH',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const AGENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponível',
  PAUSED: 'Pausado',
  OFFLINE: 'Desligado',
};

export const AGENT_STATUS_DOT_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-green-mid',
  PAUSED: 'bg-amber-500',
  OFFLINE: 'bg-red-600',
};

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

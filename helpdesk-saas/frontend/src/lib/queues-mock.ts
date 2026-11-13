// Lista fixa por enquanto — vira uma tela de administração (criar/editar
// fila) quando isso for para o back-end real.

export interface Queue {
  id: string;
  name: string;
  colorClassName: string; // reaproveita os tokens já existentes, sem inventar cor nova
}

export const QUEUES: Queue[] = [
  { id: 'suporte', name: 'Suporte', colorClassName: 'bg-blue-mid/10 text-blue-deep' },
  { id: 'comercial', name: 'Comercial', colorClassName: 'bg-green-mid/10 text-green-deep' },
  { id: 'financeiro', name: 'Financeiro', colorClassName: 'bg-chrome-2/20 text-chrome-3' },
  { id: 'tef', name: 'TEF', colorClassName: 'bg-ink-soft/10 text-ink-soft' },
];

export function getQueue(queueId: string): Queue | undefined {
  return QUEUES.find((q) => q.id === queueId);
}

export interface Colleague {
  id: string;
  name: string;
}

// Mock de colegas pra testar transferência — o "eu" real vem de useAuth().
export const MOCK_COLLEAGUES: Colleague[] = [
  { id: 'colleague-1', name: 'Marina Alves' },
  { id: 'colleague-2', name: 'Rafael Souza' },
  { id: 'colleague-3', name: 'Juliana Prado' },
];

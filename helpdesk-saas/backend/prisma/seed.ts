import { PrismaClient, TicketStatus, ClientStatus, Role, CallDirection } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS: { name: string; email: string; role: Role }[] = [
  { name: 'Heitor', email: 'heitor@genpac.com', role: 'ADMIN' },
  { name: 'Marina Alves', email: 'marina@genpac.com', role: 'SUPORTE' },
  { name: 'Rafael Souza', email: 'rafael@genpac.com', role: 'SUPORTE' },
  { name: 'Juliana Prado', email: 'juliana@genpac.com', role: 'SUPORTE' },
];

// Tipos de atendimento padrão — a partir daqui o admin pode criar/apagar
// livremente em Admin → Tipos de atendimento (substituíram o antigo enum fixo).
const TICKET_TYPE_NAMES = [
  'Suporte técnico',
  'Financeiro',
  'Dúvida de uso',
  'Bug',
  'Solicitação',
  'Cadastro',
  'Impressora',
  'Outros',
] as const;

const TICKET_TEMPLATES: Record<(typeof TICKET_TYPE_NAMES)[number], { subject: string; description: string }[]> = {
  'Suporte técnico': [
    { subject: 'Sistema travando ao emitir nota fiscal', description: 'Cliente relata que o sistema congela na tela de emissão de NF-e.' },
    { subject: 'Falha ao abrir o caixa no início do dia', description: 'Erro genérico ao tentar abrir o caixa pela manhã.' },
    { subject: 'Erro ao sincronizar estoque entre lojas', description: 'Estoque de uma filial não reflete na matriz.' },
  ],
  Financeiro: [
    { subject: 'Dúvida sobre cobrança da mensalidade', description: 'Cliente não reconhece um valor cobrado na fatura.' },
    { subject: 'Boleto não foi gerado', description: 'Cliente não recebeu o boleto do mês por e-mail.' },
    { subject: 'Cobrança em duplicidade', description: 'Cliente identifica duas cobranças no mesmo período.' },
    { subject: 'Erro no fechamento de caixa do dia', description: 'Valor do fechamento não bate com o relatório de vendas.' },
  ],
  'Dúvida de uso': [
    { subject: 'Como cadastrar um novo produto', description: 'Cliente pede orientação sobre o fluxo de cadastro de produto.' },
    { subject: 'Como emitir relatório de vendas do mês', description: 'Dúvida sobre onde encontrar o relatório mensal.' },
    { subject: 'Dúvida sobre permissões de usuário', description: 'Cliente quer entender como restringir acesso de um funcionário.' },
  ],
  Bug: [
    { subject: 'Total da venda calculado errado', description: 'Soma final diverge da soma dos itens no carrinho.' },
    { subject: 'Desconto não aplica corretamente', description: 'Cupom de desconto não reflete no valor final.' },
    { subject: 'Relatório exibindo valores duplicados', description: 'Relatório de vendas mostra alguns pedidos duas vezes.' },
  ],
  Solicitação: [
    { subject: 'Solicita novo usuário de acesso', description: 'Cliente pede criação de login para novo funcionário.' },
    { subject: 'Pedido de exportação de dados', description: 'Cliente quer exportar histórico de vendas em planilha.' },
  ],
  Cadastro: [
    { subject: 'Erro ao cadastrar novo cliente no sistema', description: 'Sistema não salva o cadastro de um novo cliente final.' },
    { subject: 'Cadastro de produto duplicado', description: 'Mesmo produto aparece cadastrado duas vezes.' },
  ],
  Impressora: [
    { subject: 'Impressora térmica não responde', description: 'Comanda não sai na impressora térmica do balcão.' },
    { subject: 'Impressão saindo cortada', description: 'Cupom fiscal sai cortado antes do fim.' },
  ],
  Outros: [
    { subject: 'Feedback sobre o sistema', description: 'Cliente deixa sugestão geral de melhoria.' },
    { subject: 'Solicitação de treinamento da equipe', description: 'Cliente pede treinamento para novos funcionários.' },
  ],
};

const TYPE_WEIGHTS: (typeof TICKET_TYPE_NAMES)[number][] = [
  'Suporte técnico', 'Suporte técnico', 'Suporte técnico',
  'Dúvida de uso', 'Dúvida de uso',
  'Financeiro', 'Financeiro',
  'Bug',
  'Impressora',
  'Solicitação',
  'Cadastro',
  'Outros',
];

// Mesmas filas que existiam hardcoded no front (queues-mock.ts) — agora
// administráveis em Admin → Filas.
const QUEUES: { name: string; colorClassName: string }[] = [
  { name: 'Suporte', colorClassName: 'bg-blue-mid/10 text-blue-deep' },
  { name: 'Comercial', colorClassName: 'bg-green-mid/10 text-green-deep' },
  { name: 'Financeiro', colorClassName: 'bg-chrome-2/20 text-chrome-3' },
  { name: 'TEF', colorClassName: 'bg-ink-soft/10 text-ink-soft' },
];

// Setor responsável por um chamado — pra onde ele pode ser encaminhado além
// de quem está atribuído individualmente. Editável em Admin → Setores.
const SECTOR_NAMES = ['Suporte', 'Desenvolvimento', 'Financeiro', 'Gerência', 'RH'];

const CLIENTS: { name: string; email: string; status: ClientStatus; ticketCount: number }[] = [
  { name: 'Clínica Vitalis', email: 'contato@vitalis.com.br', status: 'ACTIVE', ticketCount: 24 },
  { name: 'Ótica Bella Vista', email: 'financeiro@belavista-otica.com.br', status: 'ACTIVE', ticketCount: 19 },
  { name: 'Restaurante Sabor & Arte', email: 'gerencia@saborarte.com.br', status: 'ACTIVE', ticketCount: 15 },
  { name: 'Farmácia São Rafael', email: 'ti@farmaciasaorafael.com.br', status: 'ACTIVE', ticketCount: 12 },
  { name: 'Pet Shop Amigo Fiel', email: 'contato@amigofiel.com.br', status: 'ACTIVE', ticketCount: 10 },
  { name: 'Studio Beauty Hair', email: 'atendimento@beautyhair.com.br', status: 'ACTIVE', ticketCount: 9 },
  { name: 'Padaria Pão Nosso', email: 'financeiro@paonosso.com.br', status: 'ACTIVE', ticketCount: 8 },
  { name: 'Academia Vida Ativa', email: 'ti@vidaativa.com.br', status: 'ACTIVE', ticketCount: 7 },
  { name: 'Auto Peças Rodovale', email: 'contato@rodovale.com.br', status: 'ACTIVE', ticketCount: 6 },
  { name: 'Clínica Odonto Sorriso', email: 'recepcao@odontosorriso.com.br', status: 'ACTIVE', ticketCount: 5 },
  { name: 'E-commerce Petiscos Gourmet', email: 'suporte@petiscosgourmet.com.br', status: 'ACTIVE', ticketCount: 5 },
  { name: 'Loja Moda Urbana', email: 'contato@modaurbana.com.br', status: 'ACTIVE', ticketCount: 4 },
  { name: 'Mercadinho Bom Preço', email: 'gerencia@bompreco-mercado.com.br', status: 'ACTIVE', ticketCount: 3 },
  { name: 'Distribuidora Central', email: 'ti@distribuidoracentral.com.br', status: 'ACTIVE', ticketCount: 3 },
  { name: 'Sacolão da Praça', email: 'contato@sacolaodapraca.com.br', status: 'INACTIVE', ticketCount: 2 },
  { name: 'Livraria Página Viva', email: 'contato@paginaviva.com.br', status: 'INACTIVE', ticketCount: 1 },
  { name: 'Loja Tech Store', email: 'contato@techstore.com.br', status: 'INACTIVE', ticketCount: 0 },
  { name: 'Mercatto Distribuidora', email: 'financeiro@mercatto.com.br', status: 'INACTIVE', ticketCount: 0 },
];

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Datas dos últimos 60 dias, com viés pra dias úteis e manhãs — pra render
// um pico visível no dashboard em vez de ruído uniforme.
function randomTicketDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * 60));

  if ((date.getDay() === 0 || date.getDay() === 6) && Math.random() < 0.75) {
    date.setDate(date.getDate() - (date.getDay() === 0 ? 2 : 1));
  }

  const isPeakHour = Math.random() < 0.6;
  const hour = isPeakHour ? 9 + Math.floor(Math.random() * 3) : 8 + Math.floor(Math.random() * 10);
  date.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return date;
}

function randomPhone(): string {
  const part1 = 1000 + Math.floor(Math.random() * 9000);
  const part2 = 1000 + Math.floor(Math.random() * 9000);
  return `+55 11 9${part1}-${part2}`;
}

// Últimos 30 dias, horário comercial — pra "minutos em chamada" ter uma
// distribuição plausível no relatório.
function randomCallStart(): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * 30));
  date.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
  return date;
}

function randomStatus(createdAt: Date): { status: TicketStatus; closedAt: Date | null } {
  const roll = Math.random();
  if (roll < 0.55) {
    const closedAt = new Date(createdAt);
    closedAt.setDate(closedAt.getDate() + 1 + Math.floor(Math.random() * 5));
    return { status: 'CLOSED', closedAt };
  }
  if (roll < 0.8) return { status: 'IN_PROGRESS', closedAt: null };
  return { status: 'OPEN', closedAt: null };
}

async function main() {
  const passwordHash = await bcrypt.hash('senha123', 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'genpac' },
    update: {},
    create: { name: 'GenPac', slug: 'genpac' },
  });

  const userRecords: { id: string; name: string }[] = [];
  for (const userData of USERS) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        tenantId: tenant.id,
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        status: 'ACTIVE',
      },
    });
    userRecords.push({ id: user.id, name: user.name });
  }

  // Reseta dados de negócio a cada seed pra manter o dataset determinístico —
  // este projeto ainda não tem dado real de cliente, só protótipo local.
  // Call/AgentStatusLog/ChatSession primeiro (referenciam Client/User que serão recriados).
  await prisma.call.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.chatSession.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.agentStatusLog.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.task.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.ticket.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.ticketType.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.sector.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.queue.deleteMany({ where: { tenantId: tenant.id } }); // QueueMember cascade
  await prisma.client.deleteMany({ where: { tenantId: tenant.id } });

  const ticketTypeRecords = new Map<string, string>(); // name -> id
  for (const name of TICKET_TYPE_NAMES) {
    const ticketType = await prisma.ticketType.create({ data: { tenantId: tenant.id, name } });
    ticketTypeRecords.set(name, ticketType.id);
  }

  for (const name of SECTOR_NAMES) {
    await prisma.sector.create({ data: { tenantId: tenant.id, name } });
  }

  // Time inteiro enxerga todas as filas por padrão — o admin ajusta em
  // Admin → Filas quem vê o quê.
  for (const queueData of QUEUES) {
    await prisma.queue.create({
      data: {
        tenantId: tenant.id,
        name: queueData.name,
        colorClassName: queueData.colorClassName,
        members: { create: userRecords.map((u) => ({ tenantId: tenant.id, userId: u.id })) },
      },
    });
  }

  let totalTickets = 0;
  const createdClients: { id: string; name: string }[] = [];

  for (const clientData of CLIENTS) {
    const client = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        name: clientData.name,
        email: clientData.email,
        status: clientData.status,
      },
    });
    createdClients.push({ id: client.id, name: client.name });

    for (let i = 0; i < clientData.ticketCount; i += 1) {
      const typeName = randomItem(TYPE_WEIGHTS);
      const template = randomItem(TICKET_TEMPLATES[typeName]);
      const createdAt = randomTicketDate();
      const { status, closedAt } = randomStatus(createdAt);

      await prisma.ticket.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          subject: template.subject,
          description: template.description,
          ticketTypeId: ticketTypeRecords.get(typeName),
          status,
          createdAt,
          closedAt,
          handledByUserId: randomItem(userRecords).id,
        },
      });
      totalTickets += 1;
    }
  }

  const tasks: { sector: Role; title: string; description: string; insight: string }[] = [
    {
      sector: 'SUPORTE',
      title: 'Investigar picos de chamados técnicos da Clínica Vitalis',
      description: 'Cliente com maior volume de chamados de suporte técnico no período — vale uma checagem proativa.',
      insight: 'Detectado a partir de 24 chamados abertos pela Clínica Vitalis nos últimos 60 dias, a maioria em SUPORTE_TECNICO.',
    },
    {
      sector: 'SUPORTE',
      title: 'Padronizar resposta para falha de impressora térmica',
      description: 'Vários clientes relataram o mesmo sintoma — vale um artigo de ajuda ou script de atendimento padrão.',
      insight: 'Padrão recorrente identificado em chamados de categoria SUPORTE_TECNICO de múltiplos clientes.',
    },
    {
      sector: 'SUPORTE',
      title: 'Agendar treinamento remoto para clientes com dúvidas recorrentes de uso',
      description: 'Concentração de chamados de dúvida de uso indica oportunidade de treinamento em grupo.',
      insight: 'Categoria DUVIDA_USO é a segunda mais frequente no período analisado.',
    },
    {
      sector: 'FINANCEIRO',
      title: 'Revisar cobranças reportadas como duplicadas',
      description: 'Mais de um cliente relatou cobrança em duplicidade no mesmo ciclo de faturamento.',
      insight: 'Padrão identificado em chamados de categoria FINANCEIRO com o termo "duplicidade".',
    },
    {
      sector: 'FINANCEIRO',
      title: 'Contatar Clínica Vitalis sobre pendência financeira',
      description: 'Cliente de maior volume também tem chamados financeiros em aberto — priorizar contato.',
      insight: 'Cliente no topo do ranking de chamados também aparece em chamados FINANCEIRO não resolvidos.',
    },
    {
      sector: 'FINANCEIRO',
      title: 'Analisar aumento de chamados financeiros no fim do mês',
      description: 'Volume de chamados financeiros tende a concentrar nos últimos dias do ciclo de cobrança.',
      insight: 'Padrão temporal identificado agregando chamados FINANCEIRO por data de criação.',
    },
    {
      sector: 'RH',
      title: 'Avaliar reforço na equipe de suporte no horário de pico (9h-12h)',
      description: 'Volume de chamados concentra fortemente nesse intervalo — pode estar gerando fila.',
      insight: 'Pico identificado no agregado de chamados por hora de criação.',
    },
    {
      sector: 'RH',
      title: 'Planejar treinamento da equipe sobre o módulo de estoque',
      description: 'Tema aparece com frequência nos chamados técnicos e pode ser reduzido com capacitação interna.',
      insight: 'Palavra "estoque" recorrente em chamados de categoria SUPORTE_TECNICO.',
    },
    {
      sector: 'RH',
      title: 'Revisar escala da equipe de suporte às segundas-feiras',
      description: 'Segunda-feira concentra mais chamados que os demais dias úteis.',
      insight: 'Identificado no agregado de chamados por dia da semana.',
    },
    {
      sector: 'GERENCIA',
      title: 'Avaliar reativação de clientes inativos',
      description: '4 clientes estão marcados como inativos e sem chamados recentes — oportunidade de reengajamento.',
      insight: 'Contagem de clientes com status INACTIVE e baixo volume histórico de chamados.',
    },
    {
      sector: 'GERENCIA',
      title: 'Apresentar relatório de volume de chamados por categoria',
      description: 'Suporte técnico e dúvidas de uso concentram a maior parte dos chamados — insumo pra próxima reunião.',
      insight: 'Ranking de categorias gerado a partir do agregado de chamados do período.',
    },
    {
      sector: 'GERENCIA',
      title: 'Definir plano de ação para reduzir tempo médio de resolução de bugs',
      description: 'Chamados de categoria BUG têm, em média, mais tempo até o fechamento que as demais categorias.',
      insight: 'Comparação de tempo até fechamento entre categorias de chamado.',
    },
  ];

  for (const task of tasks) {
    await prisma.task.create({ data: { tenantId: tenant.id, ...task } });
  }

  // --- Chamadas históricas (últimos 30 dias) — dá substância real ao
  // relatório de "minutos em chamada por usuário/cliente".
  const CALL_COUNT = 55;
  let totalCalls = 0;
  for (let i = 0; i < CALL_COUNT; i += 1) {
    const user = randomItem(userRecords);
    const linkToClient = Math.random() < 0.85;
    const client = linkToClient ? randomItem(createdClients) : null;
    const startedAt = randomCallStart();
    const durationMinutes = 1 + Math.floor(Math.random() * 14);
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
    const direction: CallDirection = Math.random() < 0.7 ? 'INBOUND' : 'OUTBOUND';

    await prisma.call.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        clientId: client?.id,
        contactName: client?.name ?? 'Contato desconhecido',
        phone: randomPhone(),
        direction,
        startedAt,
        endedAt,
      },
    });
    totalCalls += 1;
  }

  // --- Status do atendente (últimos 14 dias, sem incluir hoje — hoje é
  // criado organicamente pelo PhoneWidget na primeira vez que abre).
  const STATUS_BLOCKS: { status: 'AVAILABLE' | 'PAUSED' | 'OFFLINE'; fromHour: number; toHour: number }[] = [
    { status: 'OFFLINE', fromHour: 0, toHour: 8 },
    { status: 'AVAILABLE', fromHour: 8, toHour: 12 },
    { status: 'PAUSED', fromHour: 12, toHour: 13 },
    { status: 'AVAILABLE', fromHour: 13, toHour: 17.5 },
    { status: 'OFFLINE', fromHour: 17.5, toHour: 24 },
  ];
  let totalStatusLogs = 0;
  for (const user of userRecords) {
    for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
      const day = new Date();
      day.setDate(day.getDate() - dayOffset);
      day.setHours(0, 0, 0, 0);

      for (const block of STATUS_BLOCKS) {
        const startedAt = new Date(day.getTime() + block.fromHour * 60 * 60_000);
        const endedAt = new Date(day.getTime() + block.toHour * 60 * 60_000);
        await prisma.agentStatusLog.create({
          data: { tenantId: tenant.id, userId: user.id, status: block.status, startedAt, endedAt },
        });
        totalStatusLogs += 1;
      }
    }
  }

  console.log(
    `Seed ok: tenant "genpac", login heitor@genpac.com / senha123, ${userRecords.length} usuários, ${CLIENTS.length} clientes, ${totalTickets} tickets, ${tasks.length} tarefas, ${totalCalls} chamadas, ${totalStatusLogs} logs de status.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

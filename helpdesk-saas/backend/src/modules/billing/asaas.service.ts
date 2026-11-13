import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

// Cliente fino da API da Asaas — sem SDK, só fetch (mesmo padrão do resto do
// projeto, sem dependências novas além do necessário). Referência oficial:
// docs.asaas.com. NUNCA logar o corpo de uma requisição daqui — carrega
// dado de cartão.
async function asaasRequest<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
  if (!env.ASAAS_API_KEY) {
    throw new AppError(500, 'Cobrança não configurada neste ambiente — falta ASAAS_API_KEY.');
  }

  const res = await fetch(`${env.ASAAS_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      access_token: env.ASAAS_API_KEY,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as { errors?: { description?: string }[] };

  if (!res.ok) {
    const description = data.errors?.[0]?.description ?? 'Erro ao comunicar com o provedor de pagamento.';
    logger.error({ event: 'billing.asaas_error', path, status: res.status, description }, 'Falha na API da Asaas.');
    throw new AppError(502, description);
  }

  return data as T;
}

export interface AsaasCustomer {
  id: string;
}

export async function createAsaasCustomer(input: { name: string; cpfCnpj: string; email: string }): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>('/customers', { method: 'POST', body: input });
}

export interface CreditCardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate: string;
}

// Cria a assinatura já com o cartão anexado — a Asaas mesma faz a
// tokenização internamente (guarda o cartão associado ao cliente); nosso
// backend nunca persiste número/CVV, só repassa e descarta.
export async function createAsaasSubscriptionWithCreditCard(input: {
  customerId: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description: string;
  creditCard: CreditCardInput;
  creditCardHolderInfo: CreditCardHolderInfo;
  remoteIp: string;
}): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: {
      customer: input.customerId,
      billingType: 'CREDIT_CARD',
      value: input.value,
      cycle: 'MONTHLY',
      nextDueDate: input.nextDueDate,
      description: input.description,
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo,
      remoteIp: input.remoteIp,
    },
  });
}

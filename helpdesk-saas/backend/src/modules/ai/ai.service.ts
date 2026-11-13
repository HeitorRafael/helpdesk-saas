import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { Tenant } from '@prisma/client';
import { decryptSecret } from '../../utils/encryption';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

interface TicketInsightInput {
  subject: string;
  context: string; // transcrição/resumo bruto do atendimento — nunca persistido, só usado nesta chamada
  ticketTypeNames: string[];
}

export interface TicketInsight {
  resolutionNotes: string;
  ticketTypeName: string | null;
}

const SYSTEM_PROMPT =
  'Você é um assistente que documenta, em português do Brasil, atendimentos de suporte técnico finalizados. ' +
  'A partir do assunto e do contexto do atendimento, escreva um resumo objetivo de uma a três frases sobre ' +
  '"o que foi feito", e classifique o atendimento em UM dos tipos fornecidos (ou null se nenhum se encaixar bem). ' +
  'Responda APENAS com um JSON válido, sem markdown, no formato exato: ' +
  '{"resolutionNotes": "...", "ticketType": "..." ou null}.';

function buildUserPrompt({ subject, context, ticketTypeNames }: TicketInsightInput): string {
  const typesList = ticketTypeNames.length > 0 ? ticketTypeNames.join(', ') : '(nenhum tipo cadastrado)';
  return `Assunto: ${subject}\nContexto do atendimento:\n${context}\n\nTipos de atendimento disponíveis: ${typesList}`;
}

// Aceita tanto um JSON puro quanto um JSON cercado por texto/markdown —
// os 3 provedores nem sempre obedecem "responda só o JSON" à risca.
function parseInsightResponse(raw: string): TicketInsight {
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;
  try {
    const parsed = JSON.parse(jsonText) as { resolutionNotes?: unknown; ticketType?: unknown };
    return {
      resolutionNotes: typeof parsed.resolutionNotes === 'string' ? parsed.resolutionNotes.trim() : raw.trim(),
      ticketTypeName: typeof parsed.ticketType === 'string' ? parsed.ticketType.trim() : null,
    };
  } catch {
    // IA não devolveu JSON válido — melhor aproveitar o texto puro como
    // resumo do que descartar a resposta inteira.
    return { resolutionNotes: raw.trim(), ticketTypeName: null };
  }
}

function authError(): AppError {
  return new AppError(
    400,
    'Chave de API de IA inválida ou revogada. Peça ao administrador da conta para verificar em Admin → Integração IA.',
  );
}

async function callClaude(apiKey: string, input: TicketInsightInput): Promise<string> {
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });
    const block = response.content.find((b) => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw authError();
    throw err;
  }
}

async function callGemini(apiKey: string, input: TicketInsightInput): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: SYSTEM_PROMPT });
  try {
    const result = await model.generateContent(buildUserPrompt(input));
    return result.response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/api key not valid|api_key_invalid|permission_denied/i.test(message)) throw authError();
    throw err;
  }
}

async function callGpt(apiKey: string, input: TicketInsightInput): Promise<string> {
  const client = new OpenAI({ apiKey });
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) throw authError();
    throw err;
  }
}

// Só é chamada quando o tenant tem provedor + chave configurados — a
// verificação fica na camada que chama (tickets.service.ts), não aqui.
export async function generateTicketInsight(
  tenant: Pick<Tenant, 'aiProvider' | 'aiApiKeyEncrypted'>,
  input: TicketInsightInput,
): Promise<TicketInsight> {
  if (!tenant.aiProvider || !tenant.aiApiKeyEncrypted) {
    throw new AppError(400, 'Nenhuma chave de API de IA configurada para este tenant.');
  }

  const apiKey = decryptSecret(tenant.aiApiKeyEncrypted);

  let raw: string;
  try {
    if (tenant.aiProvider === 'CLAUDE') raw = await callClaude(apiKey, input);
    else if (tenant.aiProvider === 'GEMINI') raw = await callGemini(apiKey, input);
    else raw = await callGpt(apiKey, input);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, provider: tenant.aiProvider }, 'Falha ao chamar provedor de IA');
    throw new AppError(502, 'Erro ao gerar resumo com IA. Tente novamente em instantes.');
  }

  return parseInsightResponse(raw);
}

import crypto from 'crypto';
import { env } from '../config/env';

// Cifra segredos por tenant (hoje só a chave de API de IA) antes de gravar no
// banco. AES-256-GCM: autenticado, então uma alteração no texto cifrado é
// detectada na descriptografia em vez de produzir lixo silenciosamente.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  return Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
}

// Formato armazenado: iv:authTag:ciphertext, tudo em hex, separado por ":".
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Formato inválido de segredo cifrado.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// Só os últimos 4 caracteres da chave real ficam visíveis — o resto é pra
// confirmar visualmente "essa é a chave certa", nunca pra reconstruir a chave.
export function maskApiKey(plain: string): string {
  if (plain.length <= 4) return '••••';
  return `••••${plain.slice(-4)}`;
}

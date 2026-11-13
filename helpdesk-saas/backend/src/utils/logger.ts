import pino from 'pino';
import { isProduction } from '../config/env';

// Logger estruturado — nunca logamos senha, token ou dado sensível.
// Redact garante isso mesmo se alguém esquecer de filtrar manualmente.
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'apiKey',
      'aiApiKeyEncrypted',
      'req.body.apiKey',
      // Pino só casa um nível por "*" — isso cobre o caso mais provável de
      // alguém logar um objeto (user, body) sem querer, um nível abaixo do
      // topo. Não é recursivo; ainda assim, evite logar objetos crus.
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  transport: isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});

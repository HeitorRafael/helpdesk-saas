# Decisões de Segurança da Fundação

Este documento existe pra você entender **o porquê** de cada escolha, não só
o quê. Quando for construir os próximos módulos, qualquer decisão nova deve
ser coerente com esses princípios.

## 1. Senhas
- Hash com `bcrypt`, custo (salt rounds) = 12.
- Nunca logamos, retornamos ou armazenamos senha em texto puro em lugar nenhum
  (nem em log de erro).
- Política mínima aplicada no backend (não só no frontend): 10+ caracteres,
  ao menos 1 número e 1 letra. Ajustável em `utils/security.ts`.

## 2. Tokens
- **Access token** (JWT): vida curta (15 min), vai no header `Authorization`,
  nunca em cookie — reduz o dano se vazar.
- **Refresh token**: vida longa (7 dias), fica em cookie `httpOnly`,
  `secure`, `sameSite=strict` — **inacessível via JavaScript**, mitigando XSS.
- Refresh tokens são **rotativos**: a cada uso, o antigo é invalidado e um
  novo é emitido. Se um token antigo for reusado (sinal de roubo), a sessão
  inteira é revogada.
- Tabela `RefreshToken` guarda apenas o **hash** do token, nunca o valor puro
  — mesmo um vazamento do banco não expõe tokens utilizáveis.

## 3. Multi-tenancy (isolamento entre empresas-cliente)
- Toda tabela de dado sensível tem `tenantId` obrigatório.
- Middleware `tenantScope` injeta o `tenantId` do JWT em toda query — as
  camadas de serviço não recebem `tenantId` do body/query da requisição,
  **só** do token assinado. Isso impede um usuário malicioso de forjar
  `tenantId=outraEmpresa` numa chamada de API.

## 4. RBAC (controle de acesso por papel)
- Papéis: `ADMIN`, `GERENCIA`, `SUPORTE`, `FINANCEIRO`, `RH`.
- Middleware `requireRole([...])` bloqueia rotas por papel antes de qualquer
  lógica de negócio rodar.

## 5. Transporte e cabeçalhos
- `helmet` ativado (CSP, HSTS, no-sniff, etc.).
- CORS restrito por allowlist de origem (definida em `.env`), não `*`.
- Cookies `secure` (exigem HTTPS) — em desenvolvimento local isso é
  desativado automaticamente via `NODE_ENV`.

## 6. Rate limiting e força bruta
- `express-rate-limit` na rota de login: máximo de tentativas por IP/minuto,
  configurável via env.
- Contador de tentativas falhas por usuário — bloqueio temporário progressivo
  (esqueleto pronto em `auth.service.ts`, ligar ao Redis quando o volume
  justificar).

## 7. Validação de entrada
- Todo body de requisição passa por schema `Zod` antes de chegar ao
  controller. Nada não-validado toca o banco.
- Prisma usa queries parametrizadas por padrão — sem risco de SQL injection
  nas queries geradas pelo client.

## 8. Auditoria
- Tabela `AuditLog` registra: quem, o quê, quando, de qual tenant, IP.
  Fundamental pro módulo de IA depois — se a IA gerar uma tarefa errada,
  você precisa rastrear a origem do dado.

## 9. Segredos
- Nenhum segredo no código. Tudo via `.env` (fora do git, veja `.gitignore`).
- `.env.example` documenta as chaves necessárias sem os valores reais.
- Em produção, os `*_SECRET` do JWT precisam ter 32+ bytes aleatórios —
  nunca reutilize os valores de exemplo.

## 10. O que ainda falta (backlog de segurança pra quando crescer)
- 2FA (TOTP) para papel `ADMIN`.
- Redis para rate limiting distribuído (hoje é em memória, só serve pra 1
  instância do servidor).
- Rotação automática de `JWT_SECRET` com período de graça.
- Criptografia em nível de campo para dados de cliente muito sensíveis, se
  o produto crescer para esse tipo de dado.

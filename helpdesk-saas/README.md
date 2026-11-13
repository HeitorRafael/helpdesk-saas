# Helpdesk Intelligence — Fundação do Projeto

SaaS multi-tenant para organizar, analisar e gerar tarefas a partir de dados de
atendimento (helpdesk). Este pacote é **só a fundação**: banco de dados,
autenticação, segurança, estrutura de pastas e a tela de login. Nenhuma
funcionalidade de negócio (dashboards, IA, módulos por setor) foi construída
ainda — isso vem depois, camada por camada, em cima desta base.

## Stack escolhida (e por quê)

| Camada | Tecnologia | Motivo |
|---|---|---|
| Backend | Node.js + TypeScript + Express | Tipagem forte, ecossistema maduro, fácil de contratar/manter depois |
| ORM / Banco | PostgreSQL + Prisma | Relacional (dados de tickets são relacionais por natureza: cliente → ticket → interação), Prisma dá migrations versionadas e proteção contra SQL injection por padrão |
| Autenticação | JWT (access curto) + refresh token rotativo em cookie httpOnly | Sem tokens de longa duração expostos ao JS do navegador (mitiga XSS) |
| Validação | Zod | Valida todo input antes de tocar no banco |
| Frontend | React + TypeScript + Vite + Tailwind | Você já tem essa stack no Vendinha, mantém consistência de conhecimento |

## Estrutura de pastas

```
helpdesk-saas/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # modelos: Tenant, User, RefreshToken, AuditLog
│   ├── src/
│   │   ├── config/              # env e conexão com banco
│   │   ├── middleware/          # auth, rate limit, RBAC, validação, erros
│   │   ├── modules/
│   │   │   ├── auth/            # login, refresh, logout
│   │   │   ├── users/           # gestão de usuários (esqueleto)
│   │   │   └── tenants/         # gestão de empresas-cliente (esqueleto)
│   │   ├── utils/                # hashing, jwt, logger
│   │   ├── app.ts
│   │   └── server.ts
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/Login.tsx
│   │   ├── components/
│   │   ├── lib/api.ts
│   │   └── styles/
│   └── package.json
├── docker-compose.yml            # sobe um Postgres local em 1 comando
└── SECURITY.md                   # decisões de segurança documentadas
```

## Multi-tenant desde o dia zero

Cada tabela relevante tem uma coluna `tenantId`. Toda query passa por um
middleware que injeta o `tenantId` do usuário logado — isso significa que,
mesmo que exista um bug em uma rota nova no futuro, é estruturalmente difícil
um tenant enxergar dado de outro. Isso é o que vai permitir vender o mesmo
sistema pra várias empresas (GenPac ou não) com isolamento de dados real.

## Como rodar (depois de extrair a pasta)

```bash
# 1. Subir o Postgres local
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env      # ajuste os valores, principalmente os *_SECRET
npm install
npx prisma migrate dev --name init
npm run dev                # sobe em http://localhost:3333

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                # sobe em http://localhost:5173
```

Abra `http://localhost:5173` — vai aparecer a tela de login (ainda sem
usuário cadastrado; o endpoint de registro inicial de tenant está no
esqueleto de `modules/tenants` para você plugar em seguida).

## O que vem depois (não está nesta entrega)

- Módulo de importação/normalização dos tickets
- Módulo de classificação via IA (Claude API)
- Geração de tarefas por setor (RH, financeiro, suporte, gerência)
- Dashboards e busca

Leia `SECURITY.md` para entender as decisões de segurança tomadas na
fundação antes de construir em cima dela.

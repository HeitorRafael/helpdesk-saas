# Helpdesk Intelligence — Documento de Contexto do Projeto

> Este documento resume toda a conversa e as decisões tomadas até aqui.
> Cole este arquivo na raiz do projeto no VS Code e use como prompt de
> contexto para a IA (Claude Code, Copilot, etc.) continuar o desenvolvimento.

---

## 1. Visão do produto

SaaS de inteligência para setores de atendimento/helpdesk. A ideia nasceu
de uma dor real observada no dia a dia de suporte técnico (GenPac, ERP/POS):

- Dados de chamados espalhados e mal organizados (clientes antigos/inativos
  poluindo buscas, sem categorização real dos tipos de atendimento).
- Nenhuma visão agregada de **quais clientes geram mais chamados**, **quais
  tipos de problema são mais recorrentes**, **em que horários/dias há pico**.
- Oportunidade de usar IA para **classificar tickets automaticamente**,
  **gerar relatórios** e **criar tarefas por setor** (RH, financeiro,
  suporte, gerência) a partir dos padrões encontrados nos dados.

Mercado-alvo validado em conversa com outro assistente: empresas de nicho
com equipes de suporte pequenas (3–10 atendentes) — clínicas, e-commerces,
telemedicina — que acham Zendesk/Freshdesk caros e complexos demais.

## 2. Quem está construindo e como

**Heitor** é o dono do produto: vem de liderança de cozinha, está em
transição de carreira pra tech, hoje em suporte técnico na GenPac, cursando
ADS. Ele **entende de produto, processo e mercado**, mas **não é
programador fluente** — usa IA para desenvolver e pensa em sistemas, não em
código.

### Decisão estratégica (importante — não pular etapa)

A primeira tentativa foi pedir uma "fundação" técnica completa (backend,
banco de dados, autenticação, segurança) pensando em produção. **Essa
abordagem foi descartada.** O motivo, validado em conversa com outro
assistente de IA:

> Se quem não programa gera uma base de código "de produção" via IA sozinho,
> o resultado tende a ser uma colcha de retalhos: parece pronto na tela, mas
> por dentro tem falhas de arquitetura e segurança. Um dev experiente
> convidado depois pra "consertar" geralmente prefere jogar tudo fora e
> recomeçar — o que desperdiça o trabalho e a credibilidade do convite.

**A estratégia correta or ora é:**

1. Construir **só a camada visual (frontend)**, com dados fictícios/mock,
   sem backend real e sem banco de dados de verdade.
2. Usar esse protótipo pra **validar a ideia com clientes em potencial**
   ("se isso fizesse X, Y, Z por R$/mês, resolveria sua dor?").
3. Só depois, **chamar um dev de confiança como sócio técnico (CTO)** —
   chegando com um produto validado, não uma ideia solta — pra construir o
   backend, o banco e a segurança de verdade.

## 3. Regras técnicas do protótipo atual (fase 1 — frontend puro)

- **Sem backend, sem banco de dados real.** Nada disso deve ser instalado
  ou configurado nesta fase.
- **Dados mockados** (array/JSON local dentro do próprio frontend),
  manipulados só em memória (React state). Ao recarregar a página, os
  dados voltam ao estado inicial — isso é esperado e proposital.
- **Camada de dados isolada da tela desde o início**: todo componente
  busca dados através de uma função/serviço único (ex: `getClientes()`,
  `getTickets()`), nunca lendo o mock diretamente. Isso é o que permite
  trocar o mock por uma API real no futuro **sem tocar nas telas** — é o
  ponto de acoplamento que o próximo dev vai substituir.
- Stack: **React + TypeScript + Vite + Tailwind** (mesma stack já usada em
  outros projetos do Heitor, como o Vendinha).
- Sem preocupação com segurança de produção nesta fase (ela será
  responsabilidade do dev/CTO técnico na fase 2). O foco é 100% em UX e
  fluxo visual.

## 4. Direção visual (design system)

Estética: **neutra, séria, corporativa** — transmitir respeito e
credibilidade. Referência dada: "cromado", "traços", escritório.

- **Cores**: base preto/branco/cinza-neutro, com azul profundo e
  verde-petróleo como cor de destaque. Elemento de assinatura: uma faixa
  diagonal com gradiente metálico (cromado) que transita para azul e verde.
- **Tipografia**: display mais geométrico/técnico para títulos (ex: Space
  Grotesk), corpo em Inter, e um monoespaçado (ex: IBM Plex Mono) para
  badges/labels técnicos ("Sistema · Multi-tenant", timestamps, tags).
- **Tela de login já desenhada**: layout dividido — painel esquerdo escuro
  com a faixa cromada diagonal e o nome do produto; painel direito branco
  com o formulário (empresa/tenant, e-mail, senha).

## 5. Telas planejadas (fase 1)

1. **Login** — já construída no primeiro protótipo.
2. **Dashboard geral** — volume de chamados, clientes com mais/menos
   chamados, tipos de atendimento mais frequentes, picos por horário/dia.
3. **Lista de clientes** — ranking por volume de chamados, busca/filtro
   (resolvendo o problema real observado: clientes inativos/antigos
   poluindo a busca no sistema atual da empresa).
4. **Detalhe de cliente/ticket** — histórico de chamados, categorização.
5. **Módulo de tarefas geradas por setor** — RH, suporte, financeiro,
   gerência: tarefas simuladas como se tivessem sido geradas por IA a
   partir de padrões nos tickets.

*(Este documento deve ser atualizado conforme as telas forem detalhadas e
construídas.)*

## 6. O que NÃO fazer nesta fase

- Não integrar API de IA real (Claude, OpenAI etc.) ainda — os "resultados
  de IA" nas telas (classificações, tarefas geradas) são **dados mockados
  que simulam o resultado esperado**, não chamadas reais.
- Não configurar autenticação real, JWT, hashing de senha, etc. — a tela de
  login existe visualmente, mas não precisa validar credenciais de verdade
  contra nada.
- Não modelar um banco de dados definitivo — os "campos" usados no mock
  servem de referência de que dados existem, mas o schema real será
  desenhado pelo dev técnico na fase 2.

## 7. Próximos passos

1. Detalhar tela por tela (Heitor descreve, a IA constrói).
2. Consolidar o protótipo navegável localmente (`npm run dev`).
3. Validar com 3–4 clientes em potencial do nicho identificado.
4. Com validação em mãos, convidar o dev/sócio técnico para estruturar
   backend, banco de dados e segurança de produção — usando este mesmo
   protótipo como especificação visual do que precisa ser construído por
   baixo.

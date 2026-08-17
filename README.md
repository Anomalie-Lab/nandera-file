# Account Status Report — Manager (Next.js)

Front-end idêntico ao HTML original. Persistência em **PostgreSQL** via Prisma, com autenticação e papéis **ADMIN** / **CLIENT**. Admins entram com e-mail Nandera; clientes entram com um **usuário** gerado a partir do nome do cliente.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + PostgreSQL próprio (embutido na imagem Docker; volume `/var/lib/postgresql/data`)
- Sessão httpOnly (`iron-session`)
- Validação Zod nas APIs
- Rate limit em login/save/reset
- Vitest (regras de negócio)

## Setup

```bash
cp .env.example .env
# edite SESSION_SECRET (>= 32 chars) e NANDERA_ADMINS

docker compose --profile dev-db up -d db
npm install
npm run db:setup
npm run build:frontend
npm run dev
```

No EasyPanel: **só o app** (Dockerfile). Volume persistente em `/var/lib/postgresql/data`. Não precisa de serviço PostgreSQL extra — o banco sobe junto no container. `DATABASE_URL` com `127.0.0.1:5432` está correto.

Abra `http://localhost:3000` e entre com usuário + senha.

### Usuários Nandera (ADMIN)

Acesso total: todas as telas, edição, criação de clientes e visualização das senhas de portal.

As contas ADMIN vêm de `NANDERA_ADMINS` no **`.env`** (formato `email:senha,email:senha`). O `.env` não vai para o git. Use `.env.example` só como modelo, sem senhas reais.

### Clientes (CLIENT)

Ao criar um cliente, o sistema gera automaticamente um **usuário a partir do nome** (ex.: `Vento Sul Importação Ltda.` → `vento.sul`) e uma senha. Não usa formato de e-mail. Os admins veem isso em **Settings → Client portal access** para informar o cliente.

O login do cliente abre **somente o Report**, em modo visualização (sem edição). O relatório mostra **Last updated** (data da última alteração).

## Scripts

| Script | Função |
|--------|--------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (+ HTML do manager) |
| `npm test` | Testes unitários |
| `npm run db:setup` | generate + push + seed |
| `npm run db:reset` | zera e re-seed |
| `npm run db:seed` | Recria admins (se faltarem) e logins de cliente |
| `npm run build:frontend` | Regenera `public/manager.html` a partir do HTML original |

## Segurança

- Rotas de API e `manager.html` exigem sessão autenticada (middleware)
- Cookie httpOnly / SameSite=Lax / Secure em produção
- Credenciais de admin só no `.env` (`NANDERA_ADMINS`); senhas de admin no banco só em hash (bcrypt). Senhas de portal do cliente ficam recuperáveis para a equipe informar o cliente
- Payload validado (enums, tamanhos, logo só `data:image/…`)
- Rate limit em login (10/min), save (120/min) e reset (5/min)
- Header `X-Powered-By` desligado
- CLIENT não consegue `PUT /api/store` nem reset

## Contrato de dados

O JSON de Backup/Import do HTML continua sendo o schema canônico. `load()` / `save()` do front chamam `GET/PUT /api/store`, que mapeia para tabelas relacionais (`Client`, `PurchaseOrder`, `Negotiation`, `ActionItem`, `ClosedDeal`, `AppState`, `User`).

Regras de negócio preservadas: KPIs auto, Deal Journey, Won→PO, Deliver→Closed, forecast (Inquiry 25% / Proposal 70%), relatório consolidado.

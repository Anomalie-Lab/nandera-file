# Account Status Report — Manager (Next.js)

Front-end idêntico ao HTML original. Persistência em **SQLite** via Prisma, com autenticação por senha.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite (banco real em `prisma/dev.db`)
- Sessão httpOnly (`iron-session`)
- Validação Zod nas APIs
- Rate limit em login/save/reset
- Vitest (regras de negócio)

## Setup

```bash
cp .env.example .env
# edite AUTH_PASSWORD e SESSION_SECRET (>= 32 chars)

npm install
npm run db:setup
npm run build:frontend
npm run dev
```

Abra `http://localhost:3000` → login com a senha de `AUTH_PASSWORD` → app em `/manager.html`.

Senha padrão de desenvolvimento (`.env`): `change-me-asr-2026`

## Scripts

| Script | Função |
|--------|--------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (+ HTML do manager) |
| `npm test` | Testes unitários |
| `npm run db:setup` | migrate + seed |
| `npm run db:reset` | zera e re-seed |
| `npm run build:frontend` | Regenera `public/manager.html` a partir do HTML original |

## Segurança

- Rotas de API e `manager.html` exigem sessão autenticada (middleware)
- Cookie httpOnly / SameSite=Lax / Secure em produção
- Comparação de senha em tempo constante
- Payload validado (enums, tamanhos, logo só `data:image/…`)
- Rate limit em login (10/min), save (120/min) e reset (5/min)
- Header `X-Powered-By` desligado

## Contrato de dados

O JSON de Backup/Import do HTML continua sendo o schema canônico. `load()` / `save()` do front chamam `GET/PUT /api/store`, que mapeia para tabelas relacionais (`Client`, `PurchaseOrder`, `Negotiation`, `ActionItem`, `ClosedDeal`, `AppState`).

Regras de negócio preservadas: KPIs auto, Deal Journey, Won→PO, Deliver→Closed, forecast (Inquiry 25% / Proposal 70%), relatório consolidado.

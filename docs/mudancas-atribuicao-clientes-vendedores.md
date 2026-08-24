# Documento de mudanças — Atribuição de clientes a vendedores

**Fonte:** áudio WhatsApp do cliente (23/08/2026, ~60s)  
**Assunto:** restringir visualização de clientes por vendedor  
**Status:** implementado (V1) — 1 cliente → 1 SELLER; SUPERADMIN gerencia  
**Data do documento:** 23/08/2026 (atualizado após implementação)

---

## 1. Transcrição do pedido (áudio)

> *“O João em relação a essa plataforma que a gente estava discutindo, eu vou precisar que você cria mais uma possibilidade de visualização. Por exemplo, nós temos vendedores, então a gente vai alocar cliente, um cliente ou dois clientes ou três clientes a este vendedor. E este vendedor só vai ter acesso aos clientes que foram designados a ele, tá? Então, você tem que montar uma planilha ou uma matriz ou um administrador que a gente consiga restringir e dar acesso por vendedor na visualização de clientes. Ficou claro, qualquer dúvida me chama aqui. Valeu.”*

---

## 2. O que o cliente pediu (interpretação)

| Necessidade | Detalhe |
|-------------|---------|
| **Papel “vendedor”** | Usuário da equipe Nandera que não vê a carteira inteira |
| **Alocação N:N** | Um vendedor pode ter 1, 2, 3… clientes; um cliente pode ter um ou mais vendedores (a confirmar) |
| **Restrição de acesso** | O vendedor **só** visualiza (e, na prática, edita) os clientes designados a ele |
| **Ferramenta de gestão** | “Planilha / matriz / administrador” para o gestor restringir e conceder acesso |
| **Não é** o login do portal do cliente final | Continua separado (usuário tipo `vento.sul` só vê o próprio relatório) |

Em resumo: **controle de carteira por vendedor**, não só o campo texto *Account manager* no relatório.

---

## 3. Como funciona hoje (gap)

### 3.1 Papéis atuais

| Role | Quem | O que vê |
|------|------|----------|
| `SUPERADMIN` | Só `fernando.arenales@nandera.com` | Todos os clientes + Users |
| `ADMIN` | Staff `@nandera.com` | **Todos** os clientes, edição total |
| `CLIENT` | Portal do cliente (ex.: `vento.sul`) | **Só** o cliente ligado em `User.clientId` |

Arquivos: `src/lib/users.ts`, `src/lib/auth.ts`, `src/app/api/store/route.ts`.

### 3.2 “Account manager” hoje

- Campo de texto em `Client.accountManager` / `meta.accountManager`
- Aparece no cabeçalho do relatório e no Excel
- **Não controla login nem filtro de lista**

### 3.3 O que falta

- Não existe relação **staff ↔ clientes**
- Todo `ADMIN` vê a lista completa no seletor **Client**
- Não há UI de matriz de atribuição
- Não há papel `SELLER` / `VENDOR` (ou ADMIN com escopo)

---

## 4. Objetivo da mudança

1. Permitir **designar clientes a vendedores**
2. Garantir que o vendedor **só acesse** os clientes atribuídos (API + UI)
3. Dar ao **SUPERADMIN** (e, se desejado, a um gestor) uma tela/matriz para atribuir e revogar
4. Manter o portal **CLIENT** e o fluxo de Excel/import intactos

---

## 5. Decisões a confirmar com o cliente (antes de codar)

| # | Pergunta | Opção sugerida (default) |
|---|----------|---------------------------|
| A | Um cliente pode ter **vários** vendedores? | Sim (N:N) |
| B | Vendedor **edita** ou só **visualiza**? | Edita os atribuídos (igual ADMIN, mas filtrado) |
| C | SUPERADMIN / “admin geral” continua vendo **todos**? | Sim |
| D | Quem monta a matriz? | Só SUPERADMIN (como Users hoje) |
| E | Novo role `SELLER` ou ADMIN com flag? | Novo role `SELLER` (mais claro) |
| F | Cliente sem vendedor: quem vê? | Só SUPERADMIN (+ ADMIN geral, se existir) |
| G | Import Excel: atribuir vendedor na planilha? | Fase 2 (opcional) |
| H | Relatório consolidado (`All clients`): só os atribuídos? | Sim, para SELLER |

---

## 6. Modelo de dados proposto

### 6.1 Novo enum / role

```prisma
enum Role {
  SUPERADMIN
  ADMIN       // opcional: “gestor” que vê tudo (ou fundir com SUPERADMIN)
  SELLER      // vendedor — só clientes atribuídos
  CLIENT      // portal
}
```

### 6.2 Tabela de atribuição (recomendada)

```prisma
model ClientAssignment {
  id        String   @id @default(cuid())
  userId    String   // staff SELLER (ou ADMIN com escopo)
  clientId  String
  createdAt DateTime @default(now())
  createdBy String?  // id do SUPERADMIN que atribuiu

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([userId, clientId])
  @@index([userId])
  @@index([clientId])
}
```

### 6.3 Alternativa rejeitada (só texto)

Usar só `accountManager` como filtro por e-mail **não atende** bem:
- frágil (digitação)
- um cliente / um texto
- sem auditoria nem UI clara

---

## 7. Mudanças funcionais (backlog)

### P0 — Essencial (pedido do áudio)

| ID | Mudança | Detalhe |
|----|---------|---------|
| **P0.1** | Role `SELLER` | Criar usuários vendedor na aba Users (ou tipo ao criar ADMIN) |
| **P0.2** | CRUD de atribuições | API: listar / atribuir / remover `userId ↔ clientId` |
| **P0.3** | Filtro em `GET /api/store` | `SELLER` recebe só clientes atribuídos; sem atribuição → lista vazia |
| **P0.4** | Filtro em `PUT /api/store` | `SELLER` só pode gravar clientes atribuídos (rejeitar alteração em outros) |
| **P0.5** | UI seletor Client | Mostra só a carteira do vendedor |
| **P0.6** | Tela “Assignments” / matriz | Grid: vendedores × clientes (checkboxes) ou lista “Clientes do vendedor X” |
| **P0.7** | Consolidado | Relatório “All clients” só com atribuídos |

### P1 — Importante

| ID | Mudança | Detalhe |
|----|---------|---------|
| **P1.1** | Sync opcional `accountManager` | Ao atribuir, preencher texto no relatório com nome/e-mail do vendedor (só display) |
| **P1.2** | Auditoria simples | Quem atribuiu / quando (já no model) |
| **P1.3** | Impedir delete de cliente com atribuições | Ou cascata (já no schema) |
| **P1.4** | Users: badge “SELLER” + contagem de clientes | Na lista de usuários |

### P2 — Opcional / depois

| ID | Mudança | Detalhe |
|----|---------|---------|
| **P2.1** | Coluna no Excel de import | “Seller email” → cria atribuição no import |
| **P2.2** | Export da matriz | Planilha vendedor × cliente (o “montar uma planilha” do áudio) |
| **P2.3** | ADMIN “global” vs SELLER | Se quiserem dois tipos de staff sem SUPERADMIN em tudo |

---

## 8. UX proposta (matriz / administrador)

### 8.1 Nova aba (só SUPERADMIN): **Assignments** (ou “Carteira”)

**Opção A — Matriz**
- Linhas: vendedores (`SELLER`)
- Colunas: clientes
- Checkbox = acesso

**Opção B — Por vendedor (mais simples no mobile)**
1. Selecionar vendedor
2. Multi-select de clientes
3. Salvar

Recomendação: **Opção B na V1**, matriz (A) na V1.1 se pedirem “planilha”.

### 8.2 Criação de vendedor

Em **Users**:
- Criar usuário `@nandera.com` com role **SELLER** (não só ADMIN)
- Senha visível/editável pelo SUPERADMIN (como hoje)

### 8.3 Experiência do vendedor

- Login igual
- Seletor Client só com os dele
- Sem aba Users / Assignments
- Sem ver senhas de portal de clientes que não são seus (e, de preferência, só dos atribuídos)

---

## 9. Regras de autorização (contrato)

```
SUPERADMIN  → todos os clientes; gerencia Users + Assignments
ADMIN       → (definir) ver todos OU tratar como gestor legado; default sugerido: ver todos até migrar
SELLER      → somente ClientAssignment(userId)
CLIENT      → somente User.clientId (inalterado)
```

**Import / Template / Backup / Reset:** só SUPERADMIN (+ ADMIN global, se mantido).  
**SELLER:** não importa Excel nem faz reset; só edita a carteira dele.

---

## 10. Impacto nos arquivos principais

| Área | Arquivos |
|------|----------|
| Schema | `prisma/schema.prisma` + migration |
| Auth / roles | `src/lib/users.ts`, `src/lib/auth.ts` |
| Store API | `src/app/api/store/route.ts`, `store-repository.ts` |
| Nova API | `src/app/api/assignments/route.ts` (ou sob `/api/users/...`) |
| UI | `public/manager.html` (aba Assignments + filtro Client) |
| Testes | `users.test.ts`, `store-repository.test.ts`, novos testes de escopo |

---

## 11. Critérios de aceite (teste com o cliente)

1. Criar vendedor A e B  
2. Atribuir clientes 1 e 2 ao A; cliente 3 ao B  
3. Login A → vê só 1 e 2; não vê 3  
4. Login B → vê só 3  
5. Login SUPERADMIN → vê 1, 2, 3 e consegue mudar a matriz  
6. Portal `vento.sul` → continua vendo só o relatório dele  
7. A tenta `PUT` alterando cliente 3 → API rejeita (403)  
8. Remover atribuição → cliente some da lista do vendedor na hora  

---

## 12. Fora de escopo deste pedido

- Mudança no layout do PDF/relatório (exceto filtrar consolidado)
- CRM completo / comissão de vendas
- App mobile nativo
- Troca do login de portal do cliente final

---

## 13. Estimativa de esforço (ordem de grandeza)

| Fase | Escopo | Esforço relativo |
|------|--------|------------------|
| V1 | Role SELLER + tabela + filtro API/UI + tela atribuição simples | Médio |
| V1.1 | Matriz visual + export Excel da carteira | Pequeno–médio |
| V2 | Seller no template Excel de import | Pequeno |

---

## 14. Próximo passo recomendado

1. **Validar com o cliente** as decisões da seção 5 (principalmente A, B, C, E)  
2. Implementar **V1 (P0)**  
3. Mostrar demo com 2 vendedores e 3 clientes  
4. Só então matriz/planilha (P2.2) se ainda pedirem  

---

## 15. Resumo executivo

Hoje **todo ADMIN vê todos os clientes**. O cliente pediu **carteira por vendedor**: alocar 1–N clientes a cada vendedor e **bloquear** a visualização do restante, com uma **tela/matriz administrativa** para gerir isso.

A mudança central é introduzir o papel **SELLER** + tabela **ClientAssignment** + filtrar `GET/PUT /api/store` e o seletor de clientes — sem alterar o portal do cliente final.

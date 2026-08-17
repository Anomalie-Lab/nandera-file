import type { Prisma, PrismaClient } from "@prisma/client";
import {
  allocateClientUsername,
  generatePassword,
  hashPassword,
  uniqueLogin,
} from "./passwords";

export type Role = "ADMIN" | "CLIENT";

export type AdminCredential = { email: string; password: string };

/** Parse `email:password,email:password` from env. Never hardcode secrets here. */
export function parseAdminList(raw: string | undefined): AdminCredential[] {
  if (!raw?.trim()) return [];
  const out: AdminCredential[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const email = trimmed.slice(0, idx).trim().toLowerCase();
    const password = trimmed.slice(idx + 1);
    if (!email || !password || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, password });
  }
  return out;
}

export function nanderaAdmins(): AdminCredential[] {
  return parseAdminList(process.env.NANDERA_ADMINS);
}

type Db = PrismaClient | Prisma.TransactionClient;

export type ClientUserSnap = {
  clientId: string;
  login: string;
  passwordHash: string;
  passwordPlain: string | null;
};

export async function ensureAdminUsers(db: Db): Promise<string[]> {
  const created: string[] = [];
  for (const admin of nanderaAdmins()) {
    const email = admin.email.toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) continue;
    await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(admin.password),
        passwordPlain: null,
        role: "ADMIN",
      },
    });
    created.push(email);
  }
  return created;
}

export async function snapshotClientUsers(db: Db): Promise<ClientUserSnap[]> {
  const users = await db.user.findMany({
    where: { role: "CLIENT", clientId: { not: null } },
  });
  return users.map((u) => ({
    clientId: u.clientId as string,
    login: u.email,
    passwordHash: u.passwordHash,
    passwordPlain: u.passwordPlain,
  }));
}

export async function restoreOrCreateClientUser(
  db: Db,
  clientId: string,
  clientName: string,
  snaps: Map<string, ClientUserSnap>,
  usedLogins: Set<string>
): Promise<void> {
  const snap = snaps.get(clientId);
  if (snap) {
    const login = uniqueLogin(snap.login, usedLogins);
    await db.user.create({
      data: {
        email: login,
        passwordHash: snap.passwordHash,
        passwordPlain: snap.passwordPlain,
        role: "CLIENT",
        clientId,
      },
    });
    return;
  }

  const password = generatePassword(10);
  const login = allocateClientUsername(clientName, usedLogins);
  await db.user.create({
    data: {
      email: login,
      passwordHash: hashPassword(password),
      passwordPlain: password,
      role: "CLIENT",
      clientId,
    },
  });
}

export async function usedLoginsSet(db: Db): Promise<Set<string>> {
  const rows = await db.user.findMany({ select: { email: true } });
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

/** Create a portal login for every client that does not already have one. */
export async function ensureMissingClientUsers(db: Db): Promise<number> {
  await migrateClientUsernames(db);
  const clients = await db.client.findMany({ include: { portalUser: true } });
  const used = await usedLoginsSet(db);
  const emptySnaps = new Map<string, ClientUserSnap>();
  let created = 0;
  for (const c of clients) {
    if (c.portalUser) {
      used.add(c.portalUser.email.toLowerCase());
      continue;
    }
    await restoreOrCreateClientUser(db, c.id, c.client, emptySnaps, used);
    created += 1;
  }
  return created;
}

/** Drop @domain from existing CLIENT logins so they are plain usernames. */
export async function migrateClientUsernames(db: Db): Promise<number> {
  const users = await db.user.findMany({ where: { role: "CLIENT" } });
  const used = await usedLoginsSet(db);
  let changed = 0;
  for (const u of users) {
    if (!u.email.includes("@")) continue;
    used.delete(u.email.toLowerCase());
    const next = uniqueLogin(u.email, used);
    if (next !== u.email.toLowerCase()) {
      await db.user.update({ where: { id: u.id }, data: { email: next } });
      changed += 1;
    }
  }
  return changed;
}

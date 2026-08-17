import type { Prisma, PrismaClient } from "@prisma/client";
import {
  allocateClientUsername,
  generatePassword,
  hashPassword,
  uniqueLogin,
} from "./passwords";

export type Role = "SUPERADMIN" | "ADMIN" | "CLIENT";

/** Only this account can create and delete staff users. */
export const SUPERADMIN_EMAIL = "fernando.arenales@nandera.com";

export type AdminCredential = { email: string; password: string };

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

export function isSuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}

export function isStaffRole(role: Role): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function canManageUsers(user: { role: Role; email: string }): boolean {
  return user.role === "SUPERADMIN" && isSuperAdminEmail(user.email);
}

function staffRoleForEmail(email: string): "SUPERADMIN" | "ADMIN" {
  return isSuperAdminEmail(email) ? "SUPERADMIN" : "ADMIN";
}

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

/** Password from NANDERA_ADMINS env for a staff email (bootstrap / display). */
export function adminPasswordFromEnv(email: string): string | null {
  const key = email.trim().toLowerCase();
  const hit = nanderaAdmins().find((a) => a.email === key);
  return hit?.password ?? null;
}

function staffDisplayPassword(
  email: string,
  role: Role,
  passwordPlain: string | null
): string | null {
  if (role === "CLIENT") return passwordPlain;
  return passwordPlain ?? adminPasswordFromEnv(email);
}

type Db = PrismaClient | Prisma.TransactionClient;

export type ClientUserSnap = {
  clientId: string;
  login: string;
  passwordHash: string;
  passwordPlain: string | null;
};

export async function ensureSuperAdminRole(db: Db): Promise<boolean> {
  const row = await db.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });
  if (!row) return false;
  if (row.role === "SUPERADMIN" && row.clientId == null) return false;
  await db.user.update({
    where: { id: row.id },
    data: { role: "SUPERADMIN", clientId: null },
  });
  return true;
}

export async function ensureAdminUsers(db: Db): Promise<string[]> {
  const created: string[] = [];
  for (const admin of nanderaAdmins()) {
    const email = admin.email.toLowerCase();
    const role = staffRoleForEmail(email);
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== role || (role === "SUPERADMIN" && existing.clientId)) {
        await db.user.update({
          where: { id: existing.id },
          data: { role, clientId: role === "SUPERADMIN" ? null : existing.clientId },
        });
      }
      if (role === "SUPERADMIN" && !existing.passwordPlain) {
        await db.user.update({
          where: { id: existing.id },
          data: { passwordPlain: admin.password },
        });
      } else if (role === "ADMIN" && !existing.passwordPlain) {
        await db.user.update({
          where: { id: existing.id },
          data: { passwordPlain: admin.password },
        });
      }
      continue;
    }
    await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(admin.password),
        passwordPlain: admin.password,
        role,
      },
    });
    created.push(email);
  }
  await ensureSuperAdminRole(db);
  return created;
}

export type ManagedUser = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  canDelete: boolean;
  password: string | null;
  clientName?: string | null;
};

export async function listStaffUsers(db: Db): Promise<ManagedUser[]> {
  const rows = await db.user.findMany({
    orderBy: [{ email: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      passwordPlain: true,
      client: { select: { client: true } },
    },
  });
  const roleOrder = (role: Role) =>
    role === "SUPERADMIN" ? 0 : role === "ADMIN" ? 1 : 2;
  return rows
    .sort((a, b) => {
      const rd = roleOrder(a.role) - roleOrder(b.role);
      if (rd !== 0) return rd;
      return a.email.localeCompare(b.email);
    })
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      canDelete: u.role === "ADMIN" && !isSuperAdminEmail(u.email),
      password: staffDisplayPassword(u.email, u.role, u.passwordPlain),
      ...(u.role === "CLIENT"
        ? { clientName: u.client?.client ?? null }
        : {}),
    }));
}

export async function createStaffUser(
  db: Db,
  input: { email: string; password: string }
): Promise<ManagedUser> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email.endsWith("@nandera.com")) {
    throw new UserAdminError("Staff users must use an @nandera.com email.");
  }
  if (isSuperAdminEmail(email)) {
    throw new UserAdminError("The SUPERADMIN account cannot be created here.");
  }
  if (password.length < 8 || password.length > 200) {
    throw new UserAdminError("Password must be between 8 and 200 characters.");
  }
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    throw new UserAdminError(`User ${email} already exists.`);
  }
  const row = await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      passwordPlain: password,
      role: "ADMIN",
    },
  });
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    canDelete: true,
    password,
  };
}

export async function deleteStaffUser(
  db: Db,
  id: string,
  actorEmail: string
): Promise<void> {
  const row = await db.user.findUnique({ where: { id } });
  if (!row) throw new UserAdminError("User not found.");
  if (row.email.toLowerCase() === actorEmail.trim().toLowerCase()) {
    throw new UserAdminError("You cannot delete your own account.");
  }
  if (row.role === "SUPERADMIN" || isSuperAdminEmail(row.email)) {
    throw new UserAdminError("The SUPERADMIN account cannot be deleted.");
  }
  if (row.role !== "ADMIN") {
    throw new UserAdminError("Only Nandera staff (ADMIN) can be deleted here.");
  }
  await db.user.delete({ where: { id } });
}

export async function updateUserPassword(
  db: Db,
  id: string,
  password: string
): Promise<ManagedUser> {
  if (password.length < 8 || password.length > 200) {
    throw new UserAdminError("Password must be between 8 and 200 characters.");
  }
  const row = await db.user.findUnique({
    where: { id },
    include: { client: { select: { client: true } } },
  });
  if (!row) throw new UserAdminError("User not found.");

  const updated = await db.user.update({
    where: { id },
    data: {
      passwordHash: hashPassword(password),
      passwordPlain: password,
    },
    include: { client: { select: { client: true } } },
  });

  return {
    id: updated.id,
    email: updated.email,
    role: updated.role,
    createdAt: updated.createdAt.toISOString(),
    canDelete:
      updated.role === "ADMIN" && !isSuperAdminEmail(updated.email),
    password,
    ...(updated.role === "CLIENT"
      ? { clientName: updated.client?.client ?? null }
      : {}),
  };
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

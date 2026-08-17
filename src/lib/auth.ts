import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  canManageUsers,
  ensureAdminUsers,
  ensureSuperAdminRole,
  isStaffRole,
  migrateClientUsernames,
  type Role,
} from "./users";
import { safeVerifyPassword } from "./passwords";

export type { Role };
export { canManageUsers, isStaffRole };

export type SessionData = {
  authenticated?: boolean;
  userId?: string;
  email?: string;
  role?: Role;
  clientId?: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  clientId: string | null;
};

export type ViewerPayload = {
  role: Role;
  canEdit: boolean;
  canManageUsers: boolean;
  user: string;
  email: string;
};

export function viewerPayload(user: AuthUser): ViewerPayload {
  return {
    role: user.role,
    canEdit: isStaffRole(user.role),
    canManageUsers: canManageUsers(user),
    user: user.email,
    email: user.email,
  };
}

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

function cookieSecure(): boolean {
  if (process.env.SESSION_SECURE === "false") return false;
  if (process.env.SESSION_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function getSessionOptions(): SessionOptions {
  return {
    password: sessionPassword(),
    cookieName: "asr_session",
    cookieOptions: {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session.authenticated || !session.userId) return null;
  const row = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    clientId: row.clientId,
  };
}

export async function requireAuth(): Promise<boolean> {
  return Boolean(await getAuthUser());
}

export async function requireAdmin(): Promise<AuthUser | null> {
  const user = await getAuthUser();
  if (!user || !isStaffRole(user.role)) return null;
  return user;
}

export async function requireSuperAdmin(): Promise<AuthUser | null> {
  const user = await getAuthUser();
  if (!user || !canManageUsers(user)) return null;
  return user;
}

export async function authenticate(
  login: string,
  password: string
): Promise<AuthUser | null> {
  await ensureAdminUsers(prisma);
  await ensureSuperAdminRole(prisma);
  await migrateClientUsernames(prisma);
  const normalized = login.trim().toLowerCase();
  const row = await prisma.user.findUnique({ where: { email: normalized } });
  const ok = safeVerifyPassword(password, row?.passwordHash ?? null);
  if (!row || !ok) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    clientId: row.clientId,
  };
}

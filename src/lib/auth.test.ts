import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
    getAll: () => [],
    has: () => false,
  })),
}));

import { prisma } from "@/lib/db";
import { wipeDb } from "@/test/wipe-db";
import { authenticate, getSessionOptions } from "@/lib/auth";
import { NANDERA_ADMINS, restoreOrCreateClientUser, usedLoginsSet } from "@/lib/users";
import { hashPassword } from "@/lib/passwords";

describe("getSessionOptions", () => {
  it("builds an httpOnly session cookie", () => {
    const opts = getSessionOptions();
    expect(opts.cookieName).toBe("asr_session");
    expect(opts.cookieOptions?.httpOnly).toBe(true);
    expect(opts.cookieOptions?.sameSite).toBe("lax");
    expect(opts.cookieOptions?.secure).toBe(false);
  });

  it("throws when SESSION_SECRET is too short", () => {
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    expect(() => getSessionOptions()).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = prev;
  });
});

describe("authenticate", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
  });

  it("signs in a Nandera admin by email", async () => {
    const admin = NANDERA_ADMINS.find((a) => a.email.startsWith("admin@"))!;
    const user = await authenticate(admin.email.toUpperCase(), admin.password);
    expect(user).not.toBeNull();
    expect(user?.role).toBe("ADMIN");
    expect(user?.email).toBe(admin.email.toLowerCase());
    expect(user?.clientId).toBeNull();
  });

  it("signs in brand@nandera.com as ADMIN", async () => {
    const user = await authenticate("brand@nandera.com", "Nandera.Brand.2026#");
    expect(user?.role).toBe("ADMIN");
    expect(user?.email).toBe("brand@nandera.com");
    expect(user?.clientId).toBeNull();
  });

  it("rejects a wrong admin password", async () => {
    const admin = NANDERA_ADMINS[0];
    expect(await authenticate(admin.email, "wrong-password")).toBeNull();
  });

  it("signs in a client with the name-based user, not an email", async () => {
    await prisma.client.create({
      data: { id: "c1", client: "Vento Sul Importação Ltda." },
    });
    const used = await usedLoginsSet(prisma);
    await restoreOrCreateClientUser(
      prisma,
      "c1",
      "Vento Sul Importação Ltda.",
      new Map(),
      used
    );
    const row = await prisma.user.findUnique({ where: { clientId: "c1" } });
    expect(row?.email).toBe("vento.sul");

    const ok = await authenticate("Vento.Sul", row!.passwordPlain!);
    expect(ok?.role).toBe("CLIENT");
    expect(ok?.email).toBe("vento.sul");
    expect(ok?.clientId).toBe("c1");

    expect(
      await authenticate("vento.sul@client.nandera.com", row!.passwordPlain!)
    ).toBeNull();
  });

  it("migrates a leftover email login then authenticates the plain user", async () => {
    await prisma.client.create({
      data: { id: "c1", client: "Andes Importações S.A." },
    });
    await prisma.user.create({
      data: {
        email: "andes.importacoes@client.nandera.com",
        passwordHash: hashPassword("PortalPass1"),
        passwordPlain: "PortalPass1",
        role: "CLIENT",
        clientId: "c1",
      },
    });

    expect(
      await authenticate("andes.importacoes@client.nandera.com", "PortalPass1")
    ).toBeNull();

    const user = await authenticate("andes.importacoes", "PortalPass1");
    expect(user?.role).toBe("CLIENT");
    expect(user?.email).toBe("andes.importacoes");
  });

  it("returns null for an unknown user", async () => {
    expect(await authenticate("nobody", "secret")).toBeNull();
  });
});

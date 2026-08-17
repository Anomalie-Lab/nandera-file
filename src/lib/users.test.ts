import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { wipeDb } from "@/test/wipe-db";
import { hashPassword } from "@/lib/passwords";
import {
  NANDERA_ADMINS,
  ensureAdminUsers,
  ensureMissingClientUsers,
  migrateClientUsernames,
  restoreOrCreateClientUser,
  snapshotClientUsers,
  usedLoginsSet,
} from "@/lib/users";

async function addClient(id: string, name: string) {
  await prisma.client.create({
    data: { id, client: name },
  });
}

describe("admin and client users", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
  });

  it("creates the Nandera admin emails once", async () => {
    const first = await ensureAdminUsers(prisma);
    expect(first.sort()).toEqual(
      NANDERA_ADMINS.map((a) => a.email.toLowerCase()).sort()
    );
    expect(first).toContain("brand@nandera.com");
    const second = await ensureAdminUsers(prisma);
    expect(second).toEqual([]);
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    expect(admins).toHaveLength(NANDERA_ADMINS.length);
    for (const a of admins) {
      expect(a.email.endsWith("@nandera.com")).toBe(true);
      expect(a.clientId).toBeNull();
      expect(a.passwordPlain).toBeNull();
    }
  });

  it("creates a CLIENT login from the company name, not an email", async () => {
    await addClient("c1", "João Silva Importação Ltda");
    const used = await usedLoginsSet(prisma);
    await restoreOrCreateClientUser(
      prisma,
      "c1",
      "João Silva Importação Ltda",
      new Map(),
      used
    );
    const user = await prisma.user.findUnique({ where: { clientId: "c1" } });
    expect(user?.role).toBe("CLIENT");
    expect(user?.email).toBe("joao.silva");
    expect(user?.email.includes("@")).toBe(false);
    expect(user?.passwordPlain?.length).toBeGreaterThanOrEqual(8);
  });

  it("gives colliding names a numeric suffix", async () => {
    await addClient("c1", "Vento Sul");
    await addClient("c2", "Vento Sul");
    const used = await usedLoginsSet(prisma);
    await restoreOrCreateClientUser(prisma, "c1", "Vento Sul", new Map(), used);
    await restoreOrCreateClientUser(prisma, "c2", "Vento Sul", new Map(), used);
    const a = await prisma.user.findUnique({ where: { clientId: "c1" } });
    const b = await prisma.user.findUnique({ where: { clientId: "c2" } });
    expect(a?.email).toBe("vento.sul");
    expect(b?.email).toBe("vento.sul2");
  });

  it("restores a snapshot and strips a leftover @domain", async () => {
    await addClient("c1", "Ignored Name");
    const hash = hashPassword("KeepMe123");
    const used = await usedLoginsSet(prisma);
    await restoreOrCreateClientUser(
      prisma,
      "c1",
      "Ignored Name",
      new Map([
        [
          "c1",
          {
            clientId: "c1",
            login: "kept.user@client.nandera.com",
            passwordHash: hash,
            passwordPlain: "KeepMe123",
          },
        ],
      ]),
      used
    );
    const user = await prisma.user.findUnique({ where: { clientId: "c1" } });
    expect(user?.email).toBe("kept.user");
    expect(user?.passwordPlain).toBe("KeepMe123");
    expect(user?.passwordHash).toBe(hash);
  });

  it("migrates existing CLIENT emails to plain usernames and leaves admins alone", async () => {
    await ensureAdminUsers(prisma);
    await addClient("c1", "Vento Sul");
    await prisma.user.create({
      data: {
        email: "vento.sul@client.nandera.com",
        passwordHash: hashPassword("pw"),
        passwordPlain: "pw",
        role: "CLIENT",
        clientId: "c1",
      },
    });
    const changed = await migrateClientUsernames(prisma);
    expect(changed).toBe(1);
    const client = await prisma.user.findUnique({ where: { clientId: "c1" } });
    expect(client?.email).toBe("vento.sul");
    const admin = await prisma.user.findUnique({
      where: { email: "admin@nandera.com" },
    });
    expect(admin?.email).toBe("admin@nandera.com");
  });

  it("ensureMissingClientUsers fills gaps and is idempotent", async () => {
    await addClient("c1", "Andes Importações S.A.");
    expect(await ensureMissingClientUsers(prisma)).toBe(1);
    expect(await ensureMissingClientUsers(prisma)).toBe(0);
    const user = await prisma.user.findUnique({ where: { clientId: "c1" } });
    expect(user?.email).toBe("andes.importacoes");
  });

  it("snapshots CLIENT users by clientId", async () => {
    await addClient("c1", "Vento Sul");
    const used = await usedLoginsSet(prisma);
    await restoreOrCreateClientUser(prisma, "c1", "Vento Sul", new Map(), used);
    const snaps = await snapshotClientUsers(prisma);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].clientId).toBe("c1");
    expect(snaps[0].login).toBe("vento.sul");
    expect(snaps[0].login.includes("@")).toBe(false);
  });
});

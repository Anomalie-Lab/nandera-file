import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { wipeDb } from "@/test/wipe-db";
import { hashPassword } from "@/lib/passwords";
import {
  SUPERADMIN_EMAIL,
  canManageUsers,
  createStaffUser,
  deleteStaffUser,
  ensureAdminUsers,
  ensureMissingClientUsers,
  ensureSuperAdminRole,
  listStaffUsers,
  updateUserPassword,
  migrateClientUsernames,
  nanderaAdmins,
  parseAdminList,
  restoreOrCreateClientUser,
  snapshotClientUsers,
  usedLoginsSet,
  UserAdminError,
} from "@/lib/users";

async function addClient(id: string, name: string) {
  await prisma.client.create({
    data: { id, client: name },
  });
}

describe("parseAdminList", () => {
  it("parses comma-separated email:password pairs", () => {
    expect(
      parseAdminList("Ada@Nandera.com:secret1,bob@nandera.com:secret2")
    ).toEqual([
      { email: "ada@nandera.com", password: "secret1" },
      { email: "bob@nandera.com", password: "secret2" },
    ]);
  });

  it("skips empty, malformed, and duplicate emails", () => {
    expect(parseAdminList("")).toEqual([]);
    expect(parseAdminList("nocolon")).toEqual([]);
    expect(parseAdminList(":nopass")).toEqual([]);
    expect(parseAdminList("a@x.com:one,a@x.com:two")).toEqual([
      { email: "a@x.com", password: "one" },
    ]);
  });
});

describe("admin and client users", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
  });

  it("creates the Nandera admin emails once", async () => {
    const configured = nanderaAdmins();
    const first = await ensureAdminUsers(prisma);
    expect(first.sort()).toEqual(configured.map((a) => a.email.toLowerCase()).sort());
    const second = await ensureAdminUsers(prisma);
    expect(second).toEqual([]);
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPERADMIN"] } },
    });
    expect(admins).toHaveLength(configured.length);
    for (const a of admins) {
      expect(a.email.endsWith("@nandera.com")).toBe(true);
      expect(a.clientId).toBeNull();
      const cred = configured.find((c) => c.email === a.email.toLowerCase());
      expect(a.passwordPlain).toBe(cred?.password ?? null);
      if (a.email === SUPERADMIN_EMAIL) expect(a.role).toBe("SUPERADMIN");
      else expect(a.role).toBe("ADMIN");
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

describe("SUPERADMIN staff management", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
  });

  it("promotes fernando.arenales@nandera.com to SUPERADMIN", async () => {
    await prisma.user.create({
      data: {
        email: SUPERADMIN_EMAIL,
        passwordHash: hashPassword("test-pass-12"),
        passwordPlain: null,
        role: "ADMIN",
      },
    });
    expect(await ensureSuperAdminRole(prisma)).toBe(true);
    const row = await prisma.user.findUnique({
      where: { email: SUPERADMIN_EMAIL },
    });
    expect(row?.role).toBe("SUPERADMIN");
    expect(
      canManageUsers({ role: row!.role, email: row!.email })
    ).toBe(true);
    expect(
      canManageUsers({ role: "ADMIN", email: "pablo.monzu@nandera.com" })
    ).toBe(false);
  });

  it("creates an ADMIN @nandera.com user and lists them", async () => {
    await prisma.user.create({
      data: {
        email: SUPERADMIN_EMAIL,
        passwordHash: hashPassword("test-pass-12"),
        role: "SUPERADMIN",
      },
    });
    const created = await createStaffUser(prisma, {
      email: "desk.ops@nandera.com",
      password: "StaffPass9",
    });
    expect(created.email).toBe("desk.ops@nandera.com");
    expect(created.role).toBe("ADMIN");
    expect(created.canDelete).toBe(true);

    const listed = await listStaffUsers(prisma);
    expect(listed[0].email).toBe(SUPERADMIN_EMAIL);
    expect(listed[0].canDelete).toBe(false);
    expect(listed.some((u) => u.email === "desk.ops@nandera.com")).toBe(true);
    const adminRow = listed.find((u) => u.email === "desk.ops@nandera.com");
    expect(adminRow?.password).toBe("StaffPass9");
  });

  it("lists passwords for all roles and updates any user password", async () => {
    await prisma.user.create({
      data: {
        email: SUPERADMIN_EMAIL,
        passwordHash: hashPassword("super-secret-12"),
        passwordPlain: "super-secret-12",
        role: "SUPERADMIN",
      },
    });
    await prisma.user.create({
      data: {
        email: "admin@nandera.com",
        passwordHash: hashPassword("admin-secret-12"),
        passwordPlain: "admin-secret-12",
        role: "ADMIN",
      },
    });
    const client = await prisma.client.create({
      data: {
        id: "c-test",
        client: "Test Client",
        accountManager: "Desk",
        period: "Aug",
        issued: "1 Aug",
        reportNo: "T-1",
        tradeLane: "CN→BR",
        preparedBy: "Desk",
        contact: "x@x.com",
        activeFoot: "",
        transitFoot: "",
      },
    });
    await prisma.user.create({
      data: {
        email: "test.client",
        passwordHash: hashPassword("portal-secret"),
        passwordPlain: "portal-secret",
        role: "CLIENT",
        clientId: client.id,
      },
    });

    const listed = await listStaffUsers(prisma);
    expect(listed).toHaveLength(3);
    expect(listed.find((u) => u.role === "SUPERADMIN")?.password).toBe(
      "super-secret-12"
    );
    expect(listed.find((u) => u.role === "ADMIN")?.password).toBe(
      "admin-secret-12"
    );
    const portal = listed.find((u) => u.role === "CLIENT");
    expect(portal?.password).toBe("portal-secret");
    expect(portal?.clientName).toBe("Test Client");

    const updated = await updateUserPassword(prisma, portal!.id, "new-portal9");
    expect(updated.password).toBe("new-portal9");
    const row = await prisma.user.findUnique({ where: { id: portal!.id } });
    expect(row?.passwordPlain).toBe("new-portal9");
  });

  it("falls back to NANDERA_ADMINS env for staff without passwordPlain", async () => {
    const prev = process.env.NANDERA_ADMINS;
    process.env.NANDERA_ADMINS = `${SUPERADMIN_EMAIL}:env-super-12,admin@nandera.com:env-admin-12`;
    try {
      await prisma.user.create({
        data: {
          email: SUPERADMIN_EMAIL,
          passwordHash: hashPassword("env-super-12"),
          passwordPlain: null,
          role: "SUPERADMIN",
        },
      });
      await prisma.user.create({
        data: {
          email: "admin@nandera.com",
          passwordHash: hashPassword("env-admin-12"),
          passwordPlain: null,
          role: "ADMIN",
        },
      });
      const listed = await listStaffUsers(prisma);
      expect(listed.find((u) => u.email === SUPERADMIN_EMAIL)?.password).toBe(
        "env-super-12"
      );
      expect(listed.find((u) => u.email === "admin@nandera.com")?.password).toBe(
        "env-admin-12"
      );
    } finally {
      process.env.NANDERA_ADMINS = prev;
    }
  });

  it("rejects non-nandera emails, the SUPERADMIN email, and duplicates", async () => {
    await expect(
      createStaffUser(prisma, { email: "fora@gmail.com", password: "StaffPass9" })
    ).rejects.toBeInstanceOf(UserAdminError);
    await expect(
      createStaffUser(prisma, {
        email: SUPERADMIN_EMAIL,
        password: "StaffPass9",
      })
    ).rejects.toBeInstanceOf(UserAdminError);

    await createStaffUser(prisma, {
      email: "desk.ops@nandera.com",
      password: "StaffPass9",
    });
    await expect(
      createStaffUser(prisma, {
        email: "desk.ops@nandera.com",
        password: "StaffPass9",
      })
    ).rejects.toThrow(/already exists/);
  });

  it("deletes an ADMIN and refuses to delete SUPERADMIN", async () => {
    const owner = await prisma.user.create({
      data: {
        email: SUPERADMIN_EMAIL,
        passwordHash: hashPassword("test-pass-12"),
        role: "SUPERADMIN",
      },
    });
    const staff = await createStaffUser(prisma, {
      email: "desk.ops@nandera.com",
      password: "StaffPass9",
    });

    await expect(
      deleteStaffUser(prisma, owner.id, SUPERADMIN_EMAIL)
    ).rejects.toThrow(/own account/);
    await expect(
      deleteStaffUser(prisma, owner.id, "pablo.monzu@nandera.com")
    ).rejects.toThrow(/SUPERADMIN/);

    await deleteStaffUser(prisma, staff.id, SUPERADMIN_EMAIL);
    expect(
      await prisma.user.findUnique({ where: { email: "desk.ops@nandera.com" } })
    ).toBeNull();
  });
});

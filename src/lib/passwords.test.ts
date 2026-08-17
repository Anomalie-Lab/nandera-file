import { describe, expect, it } from "vitest";
import {
  allocateClientUsername,
  generatePassword,
  hashPassword,
  safeVerifyPassword,
  uniqueLogin,
  usernameFromName,
  verifyPasswordHash,
} from "@/lib/passwords";

describe("password hashing", () => {
  it("hashes and verifies a known password", () => {
    const hash = hashPassword("Nandera.Fa.2026#");
    expect(hash.startsWith("$2")).toBe(true);
    expect(verifyPasswordHash("Nandera.Fa.2026#", hash)).toBe(true);
    expect(verifyPasswordHash("wrong", hash)).toBe(false);
  });

  it("rejects a garbage hash without throwing", () => {
    expect(verifyPasswordHash("secret", "not-a-bcrypt-hash")).toBe(false);
  });

  it("safeVerifyPassword returns false for missing users without throwing", () => {
    expect(safeVerifyPassword("anything", null)).toBe(false);
    expect(safeVerifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("safeVerifyPassword accepts a real hash", () => {
    const hash = hashPassword("portal-pass");
    expect(safeVerifyPassword("portal-pass", hash)).toBe(true);
    expect(safeVerifyPassword("nope", hash)).toBe(false);
  });
});

describe("usernameFromName", () => {
  it("builds a stable username from company names", () => {
    expect(usernameFromName("Vento Sul Importação Ltda.")).toBe("vento.sul");
    expect(usernameFromName("Andes Importações S.A.")).toBe("andes.importacoes");
  });

  it("uses a person's name without an email domain", () => {
    expect(usernameFromName("João Silva")).toBe("joao.silva");
    expect(usernameFromName("João Silva").includes("@")).toBe(false);
  });

  it("skips legal suffixes and short words", () => {
    expect(usernameFromName("Casa do Café Ltda")).toBe("casa.cafe");
    expect(usernameFromName("The Acme LLC")).toBe("acme");
  });

  it("falls back to client when the name has no usable parts", () => {
    expect(usernameFromName("")).toBe("client");
    expect(usernameFromName("Ltda")).toBe("client");
    expect(usernameFromName("A")).toBe("client");
  });

  it("never produces an email-shaped login", () => {
    expect(usernameFromName("foo@bar.com").includes("@")).toBe(false);
    expect(usernameFromName("contato@nandera.com")).toBe("contato.nandera");
  });
});

describe("allocateClientUsername / uniqueLogin", () => {
  it("allocates a plain username without a domain", () => {
    const used = new Set<string>();
    const a = allocateClientUsername("Vento Sul", used);
    const b = allocateClientUsername("Vento Sul", used);
    expect(a).toBe("vento.sul");
    expect(b).toBe("vento.sul2");
    expect(a.includes("@")).toBe(false);
    expect(b.includes("@")).toBe(false);
  });

  it("strips a leftover email domain from client logins", () => {
    const used = new Set<string>();
    expect(uniqueLogin("vento.sul@client.nandera.com", used)).toBe("vento.sul");
    expect(uniqueLogin("vento.sul@client.nandera.com", used)).toBe("vento.sul2");
  });

  it("normalizes case and treats empty local-part as client", () => {
    const used = new Set<string>();
    expect(uniqueLogin("  Vento.Sul  ", used)).toBe("vento.sul");
    expect(uniqueLogin("@nandera.com", used)).toBe("client");
  });
});

describe("generatePassword", () => {
  it("generates unique-looking passwords of the requested length", () => {
    const a = generatePassword(10);
    const b = generatePassword(10);
    expect(a).toHaveLength(10);
    expect(b).toHaveLength(10);
    expect(a).not.toBe(b);
  });

  it("avoids ambiguous characters", () => {
    const sample = Array.from({ length: 20 }, () => generatePassword(12)).join("");
    expect(sample).not.toMatch(/[0O1Il]/);
  });
});

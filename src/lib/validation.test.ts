import { describe, expect, it } from "vitest";
import { loginSchema, storeSchema } from "@/lib/validation";
import { seedStore } from "@/lib/domain/seed";

describe("loginSchema", () => {
  it("accepts a plain client username (not an email)", () => {
    const parsed = loginSchema.safeParse({
      user: "vento.sul",
      password: "secret12",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.user).toBe("vento.sul");
    }
  });

  it("accepts a Nandera admin email in the user field", () => {
    const parsed = loginSchema.safeParse({
      user: "admin@nandera.com",
      password: "any-password",
    });
    expect(parsed.success).toBe(true);
  });

  it("still accepts legacy { email, password } payloads", () => {
    const parsed = loginSchema.safeParse({
      email: "admin@nandera.com",
      password: "x",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("admin@nandera.com");
    }
  });

  it("trims the user field", () => {
    const parsed = loginSchema.safeParse({
      user: "  joao.silva  ",
      password: "x",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.user).toBe("joao.silva");
  });

  it("rejects a payload with neither user nor email", () => {
    const parsed = loginSchema.safeParse({ password: "x" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ user: "vento.sul", password: "" }).success
    ).toBe(false);
  });
});

describe("storeSchema client access", () => {
  it("accepts access.user without an @", () => {
    const store = seedStore();
    store.clients[0].access = { user: "vento.sul", password: "abc12345" };
    const parsed = storeSchema.safeParse(store);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.clients[0].access?.user).toBe("vento.sul");
    }
  });

  it("maps legacy access.email onto access.user", () => {
    const store = seedStore();
    store.clients[0].access = {
      user: undefined as unknown as string,
      password: "abc12345",
    };
    const raw = JSON.parse(JSON.stringify(store)) as Record<string, unknown>;
    const clients = raw.clients as Array<Record<string, unknown>>;
    clients[0].access = { email: "old.login@client.nandera.com", password: "pw" };
    const parsed = storeSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.clients[0].access?.user).toBe(
        "old.login@client.nandera.com"
      );
    }
  });
});

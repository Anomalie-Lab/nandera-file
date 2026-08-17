import { describe, expect, it } from "vitest";
import { resolveSqliteUrl } from "./sqlite-url";

describe("resolveSqliteUrl", () => {
  it("points file:./prod.db at prisma/prod.db from the repo root", () => {
    expect(resolveSqliteUrl("file:./prod.db", "D:/Projetos/nandera-file")).toBe(
      "file:D:/Projetos/nandera-file/prisma/prod.db"
    );
  });

  it("keeps an explicit prisma/ path", () => {
    expect(
      resolveSqliteUrl("file:./prisma/prod.db", "D:/Projetos/nandera-file")
    ).toBe("file:D:/Projetos/nandera-file/prisma/prod.db");
  });

  it("leaves non-sqlite URLs unchanged", () => {
    expect(resolveSqliteUrl("postgresql://localhost/db")).toBe(
      "postgresql://localhost/db"
    );
  });
});

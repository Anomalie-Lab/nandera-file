/** Runs before every test file. Isolate Prisma from prisma/dev.db. */
process.env.DATABASE_URL =
  process.env.DATABASE_URL?.startsWith("postgresql://")
    ? process.env.DATABASE_URL
    : "postgresql://nandera:nandera@127.0.0.1:5432/nandera?schema=vitest";
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = "vitest-session-secret-must-be-32-chars";
}
process.env.SESSION_SECURE = "false";
process.env.NANDERA_ADMINS =
  "admin@nandera.com:vitest-admin-pass,staff@nandera.com:vitest-staff-pass";

/** Runs before every test file. Isolate Prisma from prisma/dev.db. */
process.env.DATABASE_URL = "file:./vitest.db";
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = "vitest-session-secret-must-be-32-chars";
}
process.env.SESSION_SECURE = "false";

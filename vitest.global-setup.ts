import { execSync } from "node:child_process";

const vitestDb =
  "postgresql://nandera:nandera@127.0.0.1:5434/nandera?schema=vitest";

export default function setup() {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL?.includes("schema=vitest")
        ? process.env.DATABASE_URL
        : vitestDb,
    },
    stdio: "pipe",
  });
}

import { execSync } from "node:child_process";

export default function setup() {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL?.startsWith("postgresql://")
          ? process.env.DATABASE_URL
          : "postgresql://nandera:nandera@127.0.0.1:5432/nandera?schema=vitest",
    },
    stdio: "pipe",
  });
}

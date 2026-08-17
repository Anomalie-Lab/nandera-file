import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: "./vitest.global-setup.ts",
    setupFiles: ["dotenv/config", "./src/test/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

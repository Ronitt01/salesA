import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const stub = fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url));

// Integration tests: run against the local Supabase stack (npm run db:start).
// They create their own tenants and users and remove them afterwards.
export default defineConfig({
  resolve: { alias: { "@": src, "server-only": stub } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

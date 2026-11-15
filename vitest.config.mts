import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const stub = fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url));

// Unit tests: pure logic only. No database, no network.
export default defineConfig({
  resolve: { alias: { "@": src, "server-only": stub } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});

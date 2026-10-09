import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    // Cada archivo de test usa su propia base SQLite (ver tests/helpers.ts);
    // aislar por archivo evita que el singleton de conexión de uno se
    // filtre al siguiente.
    isolate: true,
    fileParallelism: false,
  },
});

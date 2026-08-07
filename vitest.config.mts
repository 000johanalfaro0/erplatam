import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resuelve el alias `@/*` leyendo tsconfig.json directamente.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Los tests de integración comparten una base de datos real: ejecutarlos
    // en paralelo produce falsos negativos por interferencia entre suites.
    fileParallelism: false,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: ["src/generated/**"],
    },
  },
});
